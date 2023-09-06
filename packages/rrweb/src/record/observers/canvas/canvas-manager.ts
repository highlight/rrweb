import type {
  ICanvas,
  Mirror,
  DataURLOptions,
} from '@highlight-run/rrweb-snapshot';
import type {
  blockClass,
  canvasManagerMutationCallback,
  canvasMutationCallback,
  canvasMutationCommand,
  canvasMutationWithType,
  IWindow,
  listenerHandler,
  CanvasArg,
} from '@highlight-run/rrweb-types';
import { isBlocked } from '../../../utils';
import { CanvasContext } from '@highlight-run/rrweb-types';
import initCanvas2DMutationObserver from './2d';
import initCanvasContextObserver from './canvas';
import initCanvasWebGLMutationObserver from './webgl';
import ImageBitmapDataURLWorker from 'web-worker:../../workers/image-bitmap-data-url-worker.ts';
import type { ImageBitmapDataURLRequestWorker } from '../../workers/image-bitmap-data-url-worker';

export type RafStamps = { latestId: number; invokeId: number | null };

type pendingCanvasMutationsMap = Map<
  HTMLCanvasElement,
  canvasMutationWithType[]
>;

interface Options {
  recordCanvas: boolean;
  recordVideos: boolean;
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
      recordVideos,
      initialSnapshotDelay,
      dataURLOptions,
    } = options;
    this.mutationCb = options.mutationCb;
    this.mirror = options.mirror;
    this.logger = options.logger;

    this.worker =
      new ImageBitmapDataURLWorker() as ImageBitmapDataURLRequestWorker;
    this.worker.debug = !!this.logger;
    this.worker.onmessage = (e) => {
      const { id } = e.data;
      this.snapshotInProgressMap.set(id, false);

      if (!('base64' in e.data)) {
        this.debug(null, 'canvas worker received empty message', {
          data: e.data,
          status: e.data.status,
        });
        return;
      }

      const { base64, type, dx, dy, dw, dh } = e.data;
      this.mutationCb({
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
      });
    };

    this.options = options;

    if (recordCanvas && sampling === 'all') {
      this.debug(null, 'initializing canvas mutation observer', { sampling });
      this.initCanvasMutationObserver(win, blockClass, blockSelector);
    } else if (recordCanvas && typeof sampling === 'number') {
      this.debug(null, 'initializing canvas fps observer', { sampling });
      this.initCanvasFPSObserver(
        recordVideos,
        sampling as number,
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

  public snapshot = async (element: HTMLCanvasElement) => {
    const id = this.mirror.getId(element);
    if (this.snapshotInProgressMap.get(id)) {
      this.debug(element, 'snapshotting already in progress for', id);
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
    this.debug(element, 'starting snapshotting');
    this.lastSnapshotTime.set(id, new Date().getTime());
    this.snapshotInProgressMap.set(id, true);
    try {
      if (
        // disable buffer clearing in manual snapshot mode
        this.options.samplingManual === undefined &&
        this.options.clearWebGLBuffer !== false &&
        ['webgl', 'webgl2'].includes((element as ICanvas).__context)
      ) {
        // if the canvas hasn't been modified recently,
        // its contents won't be in memory and `createImageBitmap`
        // will return a transparent imageBitmap

        const context = element.getContext((element as ICanvas).__context) as
          | WebGLRenderingContext
          | WebGL2RenderingContext
          | null;
        if (context?.getContextAttributes()?.preserveDrawingBuffer === false) {
          // Hack to load canvas back into memory so `createImageBitmap` can grab it's contents.
          // Context: https://twitter.com/Juice10/status/1499775271758704643
          // This hack might change the background color of the canvas in the unlikely event that
          // the canvas background was changed but clear was not called directly afterwards.
          context?.clear(context?.COLOR_BUFFER_BIT);
          this.debug(element, 'cleared webgl canvas to load it into memory', {
            attributes: context?.getContextAttributes(),
          });
        }
      }
      // canvas is not yet ready... this retry on the next sampling iteration.
      // we don't want to crash the worker by sending an undefined bitmap
      // if the canvas is not yet rendered.
      if (element.width === 0 || element.height === 0) {
        this.debug(element, 'not yet ready', {
          width: element.width,
          height: element.height,
        });
        return;
      }
      let scale = this.options.resizeFactor || 1;
      if (this.options.maxSnapshotDimension) {
        const maxDim = Math.max(element.width, element.height);
        scale = Math.min(scale, this.options.maxSnapshotDimension / maxDim);
      }
      const width = element.width * scale;
      const height = element.height * scale;

      const bitmap = await createImageBitmap(element, {
        resizeWidth: width,
        resizeHeight: height,
      });
      this.debug(element, 'created image bitmap', {
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
          dw: element.width,
          dh: element.height,
          dataURLOptions: this.options.dataURLOptions,
        },
        [bitmap],
      );
      this.debug(element, 'sent message');
    } catch (e) {
      this.debug(element, 'failed to snapshot', e);
    } finally {
      this.snapshotInProgressMap.set(id, false);
    }
  };

  private initCanvasFPSObserver(
    recordVideos: boolean,
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
    );

    const timeBetweenSnapshots = 1000 / fps;
    let lastSnapshotTime = 0;
    let rafId: number;

    const elementFoundTime: Map<number, number> = new Map();
    const getCanvas = (timestamp: DOMHighResTimeStamp): HTMLCanvasElement[] => {
      const matchedCanvas: HTMLCanvasElement[] = [];
      win.document.querySelectorAll('canvas').forEach((canvas) => {
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
      if (recordVideos) {
        win.document.querySelectorAll('video').forEach((video) => {
          if (video.src !== '' && video.src.indexOf('blob:') === -1) return;
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

    const takeSnapshots = async (timestamp: DOMHighResTimeStamp) => {
      if (
        lastSnapshotTime &&
        timestamp - lastSnapshotTime < timeBetweenSnapshots
      ) {
        rafId = requestAnimationFrame(takeSnapshots);
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
          .map(this.snapshot),
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
              let scale = resizeFactor || 1;
              if (maxSnapshotDimension) {
                scale = Math.min(scale, maxSnapshotDimension / maxDim);
              }
              const width = actualWidth * scale;
              const height = actualHeight * scale;

              const bitmap = await createImageBitmap(video, {
                resizeWidth: width,
                resizeHeight: height,
              });

              let outputScale = Math.max(boxWidth, boxHeight) / maxDim;
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

      rafId = requestAnimationFrame(takeSnapshots);
    };

    rafId = requestAnimationFrame(takeSnapshots);
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
      this.mirror,
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
      (values: canvasMutationCommand[], canvas: HTMLCanvasElement) => {
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
      const { type, ...rest } = value;
      return rest;
    });
    const { type } = valuesWithType[0];

    this.mutationCb({ id, type, commands: values });

    this.pendingCanvasMutations.delete(canvas);
  }
}
