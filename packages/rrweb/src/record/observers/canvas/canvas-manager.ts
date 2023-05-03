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

export class CanvasManager {
  private pendingCanvasMutations: pendingCanvasMutationsMap = new Map();
  private rafStamps: RafStamps = { latestId: 0, invokeId: null };
  private mirror: Mirror;
  private logger?: {
    debug: (...args: Parameters<typeof console.debug>) => void;
    warn: (...args: Parameters<typeof console.warn>) => void;
  };

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

  constructor(options: {
    recordCanvas: boolean;
    recordVideos: boolean;
    mutationCb: canvasMutationCallback;
    win: IWindow;
    blockClass: blockClass;
    blockSelector: string | null;
    mirror: Mirror;
    sampling?: 'all' | number;
    dataURLOptions: DataURLOptions;
    resizeFactor?: number;
    maxSnapshotDimension?: number;
    logger?: {
      debug: (...args: Parameters<typeof console.debug>) => void;
      warn: (...args: Parameters<typeof console.warn>) => void;
    };
  }) {
    const {
      sampling = 'all',
      win,
      blockClass,
      blockSelector,
      recordCanvas,
      recordVideos,
      dataURLOptions,
    } = options;
    this.mutationCb = options.mutationCb;
    this.mirror = options.mirror;
    this.logger = options.logger;

    if (recordCanvas && sampling === 'all')
      this.initCanvasMutationObserver(win, blockClass, blockSelector);
    if (recordCanvas && typeof sampling === 'number')
      this.initCanvasFPSObserver(
        recordVideos,
        sampling,
        win,
        blockClass,
        blockSelector,
        {
          dataURLOptions,
        },
        options.resizeFactor,
        options.maxSnapshotDimension,
      );
  }

  private debug(
    element: HTMLCanvasElement | HTMLVideoElement,
    ...args: Parameters<typeof console.log>
  ) {
    if (!this.logger) return;
    let prefix = `[highlight-${element.tagName.toLowerCase()}]`;
    if (element.tagName === 'canvas') {
      prefix += ` [ctx:${(element as ICanvas).__context}]`;
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

  private initCanvasFPSObserver(
    recordVideos: boolean,
    fps: number,
    win: IWindow,
    blockClass: blockClass,
    blockSelector: string | null,
    options: {
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
    const snapshotInProgressMap: Map<number, boolean> = new Map();
    const worker =
      new ImageBitmapDataURLWorker() as ImageBitmapDataURLRequestWorker;
    worker.onmessage = (e) => {
      const { id } = e.data;
      snapshotInProgressMap.set(id, false);

      if (!('base64' in e.data)) return;

      const { base64, type, canvasWidth, canvasHeight } = e.data;
      this.mutationCb({
        id,
        type: CanvasContext['2D'],
        commands: [
          {
            property: 'clearRect', // wipe canvas
            args: [0, 0, canvasWidth, canvasHeight],
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
              0,
              0,
              canvasWidth,
              canvasHeight,
            ],
          },
        ],
      });
    };

    const timeBetweenSnapshots = 1000 / fps;
    let lastSnapshotTime = 0;
    let rafId: number;

    const getCanvas = (): HTMLCanvasElement[] => {
      const matchedCanvas: HTMLCanvasElement[] = [];
      win.document.querySelectorAll('canvas').forEach((canvas) => {
        if (!isBlocked(canvas, blockClass, blockSelector, true)) {
          this.debug(canvas, 'discovered canvas');
          matchedCanvas.push(canvas);
        }
      });
      return matchedCanvas;
    };

    const getVideos = (): HTMLVideoElement[] => {
      const matchedVideos: HTMLVideoElement[] = [];
      if (recordVideos) {
        win.document.querySelectorAll('video').forEach((video) => {
          if (!isBlocked(video, blockClass, blockSelector, true)) {
            matchedVideos.push(video);
          }
        });
      }
      return matchedVideos;
    };

    const takeSnapshots = (timestamp: DOMHighResTimeStamp) => {
      if (
        lastSnapshotTime &&
        timestamp - lastSnapshotTime < timeBetweenSnapshots
      ) {
        rafId = requestAnimationFrame(takeSnapshots);
        return;
      }
      lastSnapshotTime = timestamp;

      getCanvas().forEach(async (canvas: HTMLCanvasElement) => {
        this.debug(canvas, 'starting snapshotting');
        const id = this.mirror.getId(canvas);
        if (snapshotInProgressMap.get(id)) {
          this.debug(canvas, 'snapshotting already in progress for', id);
          return;
        }
        snapshotInProgressMap.set(id, true);
        try {
          if (['webgl', 'webgl2'].includes((canvas as ICanvas).__context)) {
            // if the canvas hasn't been modified recently,
            // its contents won't be in memory and `createImageBitmap`
            // will return a transparent imageBitmap

            const context = canvas.getContext((canvas as ICanvas).__context) as
              | WebGLRenderingContext
              | WebGL2RenderingContext
              | null;
            if (
              context?.getContextAttributes()?.preserveDrawingBuffer === false
            ) {
              // Hack to load canvas back into memory so `createImageBitmap` can grab it's contents.
              // Context: https://twitter.com/Juice10/status/1499775271758704643
              // This hack might change the background color of the canvas in the unlikely event that
              // the canvas background was changed but clear was not called directly afterwards.
              context?.clear(context.COLOR_BUFFER_BIT);
            }
          }
          // canvas is not yet ready... this retry on the next sampling iteration.
          // we don't want to crash the worker if the canvas is not yet rendered.
          if (canvas.width === 0 || canvas.height === 0) {
            this.debug(canvas, 'not yet ready', {
              width: canvas.width,
              height: canvas.height,
            });
            return;
          }
          let scale = resizeFactor || 1;
          if (maxSnapshotDimension) {
            const maxDim = Math.max(canvas.width, canvas.height);
            scale = Math.min(scale, maxSnapshotDimension / maxDim);
          }
          const width = canvas.width * scale;
          const height = canvas.height * scale;

          const bitmap = await createImageBitmap(canvas, {
            resizeWidth: width,
            resizeHeight: height,
          });
          this.debug(canvas, 'created image bitmap');
          worker.postMessage(
            {
              id,
              bitmap,
              width,
              height,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
              dataURLOptions: options.dataURLOptions,
            },
            [bitmap],
          );
          this.debug(
            canvas,
            'sent message',
          );
        } finally {
          snapshotInProgressMap.set(id, false);
        }
      });
      getVideos().forEach(async (video: HTMLVideoElement) => {
        this.debug(video, 'starting video snapshotting');
        const id = this.mirror.getId(video);
        if (snapshotInProgressMap.get(id)) {
          this.debug(video, 'video snapshotting already in progress for', id);
          return;
        }
        snapshotInProgressMap.set(id, true);
        try {
          let scale = resizeFactor || 1;
          if (maxSnapshotDimension) {
            const maxDim = Math.max(video.clientWidth, video.clientHeight);
            scale = Math.min(scale, maxSnapshotDimension / maxDim);
          }
          const width = video.clientWidth * scale;
          const height = video.clientHeight * scale;

          const bitmap = await createImageBitmap(video, {
            resizeWidth: width, resizeHeight: height
          });
          this.debug(
            video,
            'created image bitmap with size',
            {
              vWidth: video.clientWidth,
              vHeight: video.clientHeight,
              width,
              height,
            },
          );
          worker.postMessage(
            {
              id,
              bitmap,
              width,
              height,
              canvasWidth: video.clientWidth,
              canvasHeight: video.clientHeight,
              dataURLOptions: options.dataURLOptions,
            },
            [bitmap],
          );
          this.debug(
            video,
            'send message',
          );
        } catch (e) {
          this.debug(video, 'failed to snapshot', e);
        } finally {
          snapshotInProgressMap.set(id, false);
        }
      });

      rafId = requestAnimationFrame(takeSnapshots);
    };

    rafId = requestAnimationFrame(takeSnapshots);

    this.resetObservers = () => {
      canvasContextReset();
      cancelAnimationFrame(rafId);
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
