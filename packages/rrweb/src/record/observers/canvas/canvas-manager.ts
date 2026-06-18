import type { ICanvas, Mirror } from 'rrweb-snapshot';
import type {
  blockClass,
  canvasManagerMutationCallback,
  canvasMutationCallback,
  canvasMutationCommand,
  canvasMutationWithType,
  IWindow,
  listenerHandler,
  CanvasArg,
  DataURLOptions,
} from '@rrweb/types';
import { isBlocked } from '../../../utils';
import { CanvasContext } from '@rrweb/types';
import initCanvas2DMutationObserver from './2d';
import initCanvasContextObserver from './canvas';
import initCanvasWebGLMutationObserver from './webgl';
import ImageBitmapDataURLWorker from '../../workers/image-bitmap-data-url-worker?worker&inline';
import type { ImageBitmapDataURLRequestWorker } from '../../workers/image-bitmap-data-url-worker';

export type RafStamps = { latestId: number; invokeId: number | null };

type pendingCanvasMutationsMap = Map<
  HTMLCanvasElement,
  canvasMutationWithType[]
>;

type SnapshotSource = HTMLCanvasElement | HTMLVideoElement;

interface Options {
  recordCanvas: boolean;
  recordLocalVideos: boolean;
  recordRemoteVideos: boolean;
  mutationCb: canvasMutationCallback;
  win: IWindow;
  blockClass: blockClass;
  blockSelector: string | null;
  mirror: Mirror;
  sampling?: 'all' | number;
  samplingManual?: number;
  clearWebGLBuffer?: boolean;
  initialSnapshotDelay?: number;
  dataURLOptions: DataURLOptions;
  resizeFactor?: number;
  maxSnapshotDimension?: number;
  logger?: {
    debug: (...args: Parameters<typeof console.debug>) => void;
    warn: (...args: Parameters<typeof console.warn>) => void;
  };
}

export class CanvasManager {
  private pendingCanvasMutations: pendingCanvasMutationsMap = new Map();
  private rafStamps: RafStamps = { latestId: 0, invokeId: null };
  private mirror: Mirror;
  private logger?: {
    debug: (...args: Parameters<typeof console.debug>) => void;
    warn: (...args: Parameters<typeof console.warn>) => void;
  };
  private worker: ImageBitmapDataURLRequestWorker;
  private snapshotInProgressMap: Map<number, boolean> = new Map();
  private lastSnapshotTime: Map<number, number> = new Map();
  private options: Options;

  private mutationCb: canvasMutationCallback;
  private resetObservers?: listenerHandler;
  private frozen = false;
  private locked = false;
  private useManualBitmapResize: boolean;

  public reset() {
    this.pendingCanvasMutations.clear();
    this.resetObservers && this.resetObservers();
  }

  public freeze() {
    this.frozen = true;
  }

  public unfreeze() {
    this.frozen = false;
  }

  public lock() {
    this.locked = true;
  }

  public unlock() {
    this.locked = false;
  }

  constructor(options: Options) {
    const {
      sampling,
      win,
      blockClass,
      blockSelector,
      recordCanvas,
      recordLocalVideos,
      recordRemoteVideos,
      initialSnapshotDelay,
      dataURLOptions,
    } = options;
    this.mutationCb = options.mutationCb;
    this.mirror = options.mirror;
    this.logger = options.logger;

    this.worker =
      new ImageBitmapDataURLWorker() as ImageBitmapDataURLRequestWorker;
    this.worker.onmessage = (e) => {
      const { id } = e.data;
      this.snapshotInProgressMap.set(id, false);

      if (!('base64' in e.data)) {
        this.debug(null, 'canvas worker received empty message', {
          id,
          data: e.data,
          status: e.data.status,
        });
        return;
      }

      const { base64, type, dx, dy, dw, dh } = e.data;
      const mutation = {
        id,
        type: CanvasContext['2D'],
        commands: [
          {
            property: 'clearRect', // wipe canvas
            args: [dx, dy, dw, dh],
          },
          {
            property: 'drawImage', // draws (semi-transparent) image
            args: [
              {
                rr_type: 'ImageBitmap',
                args: [
                  {
                    rr_type: 'Blob',
                    data: [{ rr_type: 'ArrayBuffer', base64 }],
                    type,
                  },
                ],
              } as CanvasArg,
              dx,
              dy,
              dw,
              dh,
            ],
          },
        ],
      };
      this.debug(null, 'canvas worker recording mutation', mutation);
      this.mutationCb(mutation);
    };

    this.options = options;
    this.useManualBitmapResize = CanvasManager.shouldUseManualBitmapResize(win);

    if (recordCanvas && sampling === 'all') {
      this.debug(null, 'initializing canvas mutation observer', { sampling });
      this.initCanvasMutationObserver(win, blockClass, blockSelector);
    } else if (recordCanvas && typeof sampling === 'number') {
      this.debug(null, 'initializing canvas fps observer', { sampling });
      this.initCanvasFPSObserver(
        recordLocalVideos,
        recordRemoteVideos,
        sampling,
        win,
        blockClass,
        blockSelector,
        {
          initialSnapshotDelay,
          dataURLOptions,
        },
        options.resizeFactor,
        options.maxSnapshotDimension,
      );
    }
  }

  private debug(
    element: HTMLCanvasElement | HTMLVideoElement | null,
    ...args: Parameters<typeof console.log>
  ) {
    if (!this.logger) return;
    const id = this.mirror.getId(element);
    let prefix = '[highlight-canvas-manager]';
    if (element) {
      prefix = `[highlight-canvas] [id:${id}]`;
      if (element.tagName.toLowerCase() === 'canvas') {
        prefix += ` [ctx:${(element as ICanvas).__context}]`;
      }
    }
    this.logger.debug(prefix, element, ...args);
  }

  private processMutation: canvasManagerMutationCallback = (
    target,
    mutation,
  ) => {
    const newFrame =
      this.rafStamps.invokeId &&
      this.rafStamps.latestId !== this.rafStamps.invokeId;
    if (newFrame || !this.rafStamps.invokeId)
      this.rafStamps.invokeId = this.rafStamps.latestId;

    if (!this.pendingCanvasMutations.has(target)) {
      this.pendingCanvasMutations.set(target, []);
    }

    this.pendingCanvasMutations.get(target)!.push(mutation);
  };

  public async snapshot(canvas: HTMLCanvasElement) {
    const id = this.mirror.getId(canvas);
    if (this.snapshotInProgressMap.get(id)) {
      this.debug(canvas, 'snapshotting already in progress for', id);
      return;
    }
    const timeBetweenSnapshots =
      1000 /
      (typeof this.options.samplingManual === 'number'
        ? this.options.samplingManual
        : 1);
    const lastSnapshotTime = this.lastSnapshotTime.get(id);
    if (
      lastSnapshotTime &&
      new Date().getTime() - lastSnapshotTime < timeBetweenSnapshots
    ) {
      return;
    }
    this.debug(canvas, 'starting snapshotting');

    // The browser throws if the canvas is 0 in size
    // Uncaught (in promise) DOMException: Failed to execute 'createImageBitmap' on 'Window': The source image width is 0.
    // Assuming the same happens with height
    if (canvas.width === 0 || canvas.height === 0) {
      this.debug(canvas, 'not yet ready', {
        width: canvas.width,
        height: canvas.height,
      });
      return;
    }

    this.lastSnapshotTime.set(id, new Date().getTime());
    this.snapshotInProgressMap.set(id, true);
    try {
      if (
        this.options.clearWebGLBuffer !== false &&
        ['webgl', 'webgl2'].includes((canvas as ICanvas).__context)
      ) {
        // if the canvas hasn't been modified recently,
        // its contents won't be in memory and `createImageBitmap`
        // will return a transparent imageBitmap

        const context = canvas.getContext((canvas as ICanvas).__context) as
          | WebGLRenderingContext
          | WebGL2RenderingContext
          | null;
        if (context?.getContextAttributes()?.preserveDrawingBuffer === false) {
          // Hack to load canvas back into memory so `createImageBitmap` can grab it's contents.
          // Context: https://twitter.com/Juice10/status/1499775271758704643
          // Preferably we set `preserveDrawingBuffer` to true, but that's not always possible,
          // especially when canvas is loaded before rrweb.
          // This hack can wipe the background color of the canvas in the (unlikely) event that
          // the canvas background was changed but clear was not called directly afterwards.
          // Example of this hack having negative side effect: https://visgl.github.io/react-map-gl/examples/layers
          context.clear(context.COLOR_BUFFER_BIT);
          this.debug(canvas, 'cleared webgl canvas to load it into memory', {
            attributes: context?.getContextAttributes(),
          });
        }
      }
      // canvas is not yet ready... this retry on the next sampling iteration.
      // we don't want to crash the worker by sending an undefined bitmap
      // if the canvas is not yet rendered.
      if (canvas.width === 0 || canvas.height === 0) {
        this.debug(canvas, 'not yet ready', {
          width: canvas.width,
          height: canvas.height,
        });
        return;
      }
      let scale = this.options.resizeFactor || 1;
      if (this.options.maxSnapshotDimension) {
        const maxDim = Math.max(canvas.width, canvas.height);
        scale = Math.min(scale, this.options.maxSnapshotDimension / maxDim);
      }
      const width = canvas.width * scale;
      const height = canvas.height * scale;

      const bitmap = await this.createSnapshotBitmap(canvas, width, height);
      this.debug(canvas, 'created image bitmap', {
        width: bitmap.width,
        height: bitmap.height,
      });
      this.worker.postMessage(
        {
          id,
          bitmap,
          width,
          height,
          dx: 0,
          dy: 0,
          dw: canvas.width,
          dh: canvas.height,
          dataURLOptions: this.options.dataURLOptions,
          logDebug: !!this.logger,
        },
        [bitmap],
      );
      this.debug(canvas, 'sent message');
    } catch (e) {
      this.debug(canvas, 'failed to snapshot', e);
    } finally {
      this.snapshotInProgressMap.set(id, false);
    }
  }

  private initCanvasFPSObserver(
    recordLocalVideos: boolean,
    recordRemoteVideos: boolean,
    fps: number,
    win: IWindow,
    blockClass: blockClass,
    blockSelector: string | null,
    options: {
      initialSnapshotDelay?: number;
      dataURLOptions: DataURLOptions;
    },
    resizeFactor?: number,
    maxSnapshotDimension?: number,
  ) {
    const canvasContextReset = initCanvasContextObserver(
      win,
      blockClass,
      blockSelector,
      true,
    );

    const timeBetweenSnapshots = 1000 / fps;
    let lastSnapshotTime = 0;
    let rafId: number;

    const elementFoundTime: Map<number, number> = new Map();

    const querySelectorAll = <T extends 'canvas' | 'video'>(
      node: ParentNode,
      selector: T,
    ): (T extends 'canvas' ? HTMLCanvasElement : HTMLVideoElement)[] => {
      type NodeType = T extends 'canvas' ? HTMLCanvasElement : HTMLVideoElement;
      const nodes: NodeType[] = [];
      node.querySelectorAll(selector).forEach((n) => nodes.push(n as NodeType));
      const nodeIterator = document.createNodeIterator(node, Node.ELEMENT_NODE);
      let currentNode: Element | null;
      while ((currentNode = nodeIterator.nextNode() as Element | null)) {
        if (currentNode?.shadowRoot) {
          nodes.push(...querySelectorAll(currentNode.shadowRoot, selector));
        }
      }
      return nodes;
    };

    const getCanvas = (timestamp: DOMHighResTimeStamp): HTMLCanvasElement[] => {
      const matchedCanvas: HTMLCanvasElement[] = [];
      querySelectorAll(win.document, 'canvas').forEach((canvas) => {
        if (!isBlocked(canvas, blockClass, blockSelector, true)) {
          this.debug(canvas, 'discovered canvas');
          matchedCanvas.push(canvas);
          const id = this.mirror.getId(canvas);
          if (!elementFoundTime.has(id)) {
            elementFoundTime.set(id, timestamp);
          }
        }
      });
      return matchedCanvas;
    };

    const getVideos = (timestamp: DOMHighResTimeStamp): HTMLVideoElement[] => {
      const matchedVideos: HTMLVideoElement[] = [];
      if (recordLocalVideos || recordRemoteVideos) {
        querySelectorAll(win.document, 'video').forEach((video) => {
          if (!recordRemoteVideos) {
            // remote video
            if (video.src !== '' && video.src.indexOf('blob:') === -1) {
              return;
            }
          }
          if (!recordLocalVideos) {
            // local video - webcam (no src) or memory (blob)
            if (video.src === '' || video.src.indexOf('blob:') !== -1) {
              return;
            }
          }
          if (!isBlocked(video, blockClass, blockSelector, true)) {
            matchedVideos.push(video);
            const id = this.mirror.getId(video);
            if (!elementFoundTime.has(id)) {
              elementFoundTime.set(id, timestamp);
            }
          }
        });
      }
      return matchedVideos;
    };

    const scheduleTakeSnapshots = () => {
      rafId = requestAnimationFrame((timestamp) => {
        void takeSnapshots(timestamp);
      });
    };

    const takeSnapshots = async (timestamp: DOMHighResTimeStamp) => {
      if (
        lastSnapshotTime &&
        timestamp - lastSnapshotTime < timeBetweenSnapshots
      ) {
        scheduleTakeSnapshots();
        return;
      }
      lastSnapshotTime = timestamp;

      const filterElementStartTime = (
        canvas: HTMLCanvasElement | HTMLVideoElement,
      ) => {
        const id = this.mirror.getId(canvas);
        const foundTime = elementFoundTime.get(id)!;
        const hadLoadingTime =
          !options.initialSnapshotDelay ||
          timestamp - foundTime > options.initialSnapshotDelay;
        this.debug(canvas, {
          delay: options.initialSnapshotDelay,
          delta: timestamp - foundTime,
          hadLoadingTime,
        });
        return hadLoadingTime;
      };

      const promises: Promise<void>[] = [];
      promises.push(
        ...getCanvas(timestamp)
          .filter(filterElementStartTime)
          .map((canvas) => this.snapshot(canvas)),
      );
      promises.push(
        ...getVideos(timestamp)
          .filter(filterElementStartTime)
          .map(async (video: HTMLVideoElement) => {
            this.debug(video, 'starting video snapshotting');
            const id = this.mirror.getId(video);
            if (this.snapshotInProgressMap.get(id)) {
              this.debug(
                video,
                'video snapshotting already in progress for',
                id,
              );
              return;
            }
            this.snapshotInProgressMap.set(id, true);
            try {
              const { width: boxWidth, height: boxHeight } =
                video.getBoundingClientRect();
              const { actualWidth, actualHeight } = {
                actualWidth: video.videoWidth,
                actualHeight: video.videoHeight,
              };
              const maxDim = Math.max(actualWidth, actualHeight);

              // video is not yet ready... this retry on the next sampling iteration.
              // we don't want to crash the worker by sending an undefined bitmap
              // if the video is not yet rendered.
              if (maxDim === 0) {
                this.debug(video, 'not yet ready', {
                  width: video.width,
                  height: video.height,
                  actualWidth,
                  actualHeight,
                  boxWidth,
                  boxHeight,
                });
                return;
              }

              let scale = resizeFactor || 1;
              if (maxSnapshotDimension) {
                scale = Math.min(scale, maxSnapshotDimension / maxDim);
              }
              const width = actualWidth * scale;
              const height = actualHeight * scale;

              const bitmap = await this.createSnapshotBitmap(
                video,
                width,
                height,
              );

              const outputScale = Math.max(boxWidth, boxHeight) / maxDim;
              const outputWidth = actualWidth * outputScale;
              const outputHeight = actualHeight * outputScale;
              const offsetX = (boxWidth - outputWidth) / 2;
              const offsetY = (boxHeight - outputHeight) / 2;
              this.debug(video, 'created image bitmap', {
                actualWidth,
                actualHeight,
                boxWidth,
                boxHeight,
                outputWidth,
                outputHeight,
                resizeWidth: width,
                resizeHeight: height,
                scale,
                outputScale,
                offsetX,
                offsetY,
              });

              this.worker.postMessage(
                {
                  id,
                  bitmap,
                  width,
                  height,
                  dx: offsetX,
                  dy: offsetY,
                  dw: outputWidth,
                  dh: outputHeight,
                  dataURLOptions: options.dataURLOptions,
                  logDebug: !!this.logger,
                },
                [bitmap],
              );
              this.debug(video, 'send message');
            } catch (e) {
              this.debug(video, 'failed to snapshot', e);
            } finally {
              this.snapshotInProgressMap.set(id, false);
            }
          }),
      );
      await Promise.all(promises).catch(console.error);

      scheduleTakeSnapshots();
    };

    scheduleTakeSnapshots();
    this.resetObservers = () => {
      canvasContextReset();
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }

  private initCanvasMutationObserver(
    win: IWindow,
    blockClass: blockClass,
    blockSelector: string | null,
  ): void {
    this.startRAFTimestamping();
    this.startPendingCanvasMutationFlusher();

    const canvasContextReset = initCanvasContextObserver(
      win,
      blockClass,
      blockSelector,
      false,
    );
    const canvas2DReset = initCanvas2DMutationObserver(
      this.processMutation.bind(this),
      win,
      blockClass,
      blockSelector,
    );

    const canvasWebGL1and2Reset = initCanvasWebGLMutationObserver(
      this.processMutation.bind(this),
      win,
      blockClass,
      blockSelector,
    );

    this.resetObservers = () => {
      canvasContextReset();
      canvas2DReset();
      canvasWebGL1and2Reset();
    };
  }

  private startPendingCanvasMutationFlusher() {
    requestAnimationFrame(() => this.flushPendingCanvasMutations());
  }

  private startRAFTimestamping() {
    const setLatestRAFTimestamp = (timestamp: DOMHighResTimeStamp) => {
      this.rafStamps.latestId = timestamp;
      requestAnimationFrame(setLatestRAFTimestamp);
    };
    requestAnimationFrame(setLatestRAFTimestamp);
  }

  flushPendingCanvasMutations() {
    this.pendingCanvasMutations.forEach(
      (_values: canvasMutationCommand[], canvas: HTMLCanvasElement) => {
        const id = this.mirror.getId(canvas);
        this.flushPendingCanvasMutationFor(canvas, id);
      },
    );
    requestAnimationFrame(() => this.flushPendingCanvasMutations());
  }

  flushPendingCanvasMutationFor(canvas: HTMLCanvasElement, id: number) {
    if (this.frozen || this.locked) {
      return;
    }

    const valuesWithType = this.pendingCanvasMutations.get(canvas);
    if (!valuesWithType || id === -1) return;

    const values = valuesWithType.map((value) => {
      const { type: omittedType, ...rest } = value;
      void omittedType;
      return rest;
    });
    const { type } = valuesWithType[0];

    this.mutationCb({ id, type, commands: values });

    this.pendingCanvasMutations.delete(canvas);
  }

  private static shouldUseManualBitmapResize(win: IWindow): boolean {
    const navigator = win.navigator as Navigator & { maxTouchPoints?: number };
    const userAgent = navigator?.userAgent || '';
    const vendor = navigator?.vendor || '';
    const platform = navigator?.platform || '';

    const isIOSWebKit =
      /iP(ad|hone|od)/.test(userAgent) ||
      (platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    const isDesktopSafari =
      vendor === 'Apple Computer, Inc.' &&
      /AppleWebKit\//.test(userAgent) &&
      /Safari\//.test(userAgent) &&
      !/(Chrome|Chromium|Edg|OPR)\//.test(userAgent);

    return isIOSWebKit || isDesktopSafari;
  }

  private createResizeCanvas(
    width: number,
    height: number,
  ): HTMLCanvasElement | OffscreenCanvas | null {
    const OffscreenCanvasConstructor =
      (
        this.options.win as IWindow & {
          OffscreenCanvas?: typeof OffscreenCanvas;
        }
      ).OffscreenCanvas ||
      (typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas : undefined);

    if (OffscreenCanvasConstructor) {
      return new OffscreenCanvasConstructor(width, height);
    }

    const resizeCanvas = this.options.win.document?.createElement?.('canvas');
    if (!resizeCanvas) {
      return null;
    }
    resizeCanvas.width = width;
    resizeCanvas.height = height;
    return resizeCanvas;
  }

  private getSnapshotSourceDimensions(source: SnapshotSource) {
    if ('videoWidth' in source) {
      return {
        width: source.videoWidth,
        height: source.videoHeight,
      };
    }

    return {
      width: source.width,
      height: source.height,
    };
  }

  private async createSnapshotBitmap(
    source: SnapshotSource,
    width: number,
    height: number,
  ) {
    const resizeWidth = Math.max(1, Math.round(width));
    const resizeHeight = Math.max(1, Math.round(height));

    if (!this.useManualBitmapResize) {
      return createImageBitmap(source, {
        resizeWidth,
        resizeHeight,
      });
    }

    const sourceDimensions = this.getSnapshotSourceDimensions(source);
    if (
      sourceDimensions.width === resizeWidth &&
      sourceDimensions.height === resizeHeight
    ) {
      return createImageBitmap(source);
    }

    const resizeCanvas = this.createResizeCanvas(resizeWidth, resizeHeight);
    const context = resizeCanvas?.getContext('2d');
    if (!resizeCanvas || !context) {
      return createImageBitmap(source, {
        resizeWidth,
        resizeHeight,
      });
    }

    context.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in context) {
      context.imageSmoothingQuality = 'medium';
    }
    context.drawImage(source, 0, 0, resizeWidth, resizeHeight);

    return createImageBitmap(resizeCanvas);
  }
}
