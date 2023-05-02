import type {
  ICanvas,
  Mirror,
  DataURLOptions,
} from '@highlight-run/rrweb-snapshot';
import type {
  blockClass,
  canvasMutationCallback,
  canvasMutationCommand,
  canvasMutationWithType,
  IWindow,
  listenerHandler,
  CanvasArg,
} from '@highlight-run/rrweb-types';
import { isBlocked } from '../../../utils';
import { CanvasContext } from '@highlight-run/rrweb-types';
import ImageBitmapDataURLWorker from 'web-worker:../../workers/image-bitmap-data-url-worker.ts';
import type { ImageBitmapDataURLRequestWorker } from '../../workers/image-bitmap-data-url-worker';

export type RafStamps = { latestId: number; invokeId: number | null };

type pendingVideoMutationsMap = Map<HTMLVideoElement, canvasMutationCommand[]>;

export class InlineVideoManager {
  private pendingVideoMutations: pendingVideoMutationsMap = new Map();
  private rafStamps: RafStamps = { latestId: 0, invokeId: null };
  private mirror: Mirror;

  private mutationCb: canvasMutationCallback;
  private resetObservers?: listenerHandler;
  private frozen = false;
  private locked = false;

  public reset() {
    this.pendingVideoMutations.clear();
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
    inlineVideo: boolean;
    mutationCb: canvasMutationCallback;
    win: IWindow;
    blockClass: blockClass;
    blockSelector: string | null;
    mirror: Mirror;
    dataURLOptions: DataURLOptions;
    sampling: number;
    resizeQuality?: 'pixelated' | 'low' | 'medium' | 'high';
    resizeFactor?: number;
    maxSnapshotDimension?: number;
  }) {
    const {
      sampling,
      win,
      blockClass,
      blockSelector,
      inlineVideo,
      dataURLOptions,
    } = options;
    this.mutationCb = options.mutationCb;
    this.mirror = options.mirror;

    if (inlineVideo)
      this.initVideoFPSObserver(
        sampling,
        win,
        blockClass,
        blockSelector,
        {
          dataURLOptions,
        },
        options.resizeQuality,
        options.resizeFactor,
        options.maxSnapshotDimension,
      );
  }

  private initVideoFPSObserver(
    fps: number,
    win: IWindow,
    blockClass: blockClass,
    blockSelector: string | null,
    options: {
      dataURLOptions: DataURLOptions;
    },
    resizeQuality?: 'pixelated' | 'low' | 'medium' | 'high',
    resizeFactor?: number,
    maxSnapshotDimension?: number,
  ) {
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

    const getVideos = (): HTMLVideoElement[] => {
      const matchedVideos: HTMLVideoElement[] = [];
      win.document.querySelectorAll('video').forEach((video) => {
        if (!isBlocked(video, blockClass, blockSelector, true)) {
          matchedVideos.push(video);
        }
      });
      return matchedVideos;
    };

    const takeVideoSnapshots = (timestamp: DOMHighResTimeStamp) => {
      if (
        lastSnapshotTime &&
        timestamp - lastSnapshotTime < timeBetweenSnapshots
      ) {
        rafId = requestAnimationFrame(takeVideoSnapshots);
        return;
      }
      lastSnapshotTime = timestamp;

      getVideos()
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .forEach(async (video: HTMLVideoElement) => {
          const id = this.mirror.getId(video);
          if (snapshotInProgressMap.get(id)) return;
          snapshotInProgressMap.set(id, true);
          // video is not yet ready... this retry on the next sampling iteration.
          // we don't want to crash the worker if the video is not yet rendered.
          if (video.width === 0 || video.height === 0) {
            return;
          }
          let scale = resizeFactor || 1;
          if (maxSnapshotDimension) {
            const maxDim = Math.max(video.width, video.height);
            scale = Math.min(scale, maxSnapshotDimension / maxDim);
          }
          const width = video.width * scale;
          const height = video.height * scale;

          const bitmap = await createImageBitmap(video, {
            resizeQuality: resizeQuality || 'low',
            resizeWidth: width,
            resizeHeight: height,
          });
          worker.postMessage(
            {
              id,
              bitmap,
              width,
              height,
              canvasWidth: video.width,
              canvasHeight: video.height,
              dataURLOptions: options.dataURLOptions,
            },
            [bitmap],
          );
        });
      rafId = requestAnimationFrame(takeVideoSnapshots);
    };

    rafId = requestAnimationFrame(takeVideoSnapshots);

    this.resetObservers = () => {
      cancelAnimationFrame(rafId);
    };
  }

  flushPendingCanvasMutations() {
    this.pendingVideoMutations.forEach(
      (values: canvasMutationCommand[], video: HTMLVideoElement) => {
        const id = this.mirror.getId(video);
        this.flushPendingCanvasMutationFor(video, id);
      },
    );
    requestAnimationFrame(() => this.flushPendingCanvasMutations());
  }

  flushPendingCanvasMutationFor(video: HTMLVideoElement, id: number) {
    if (this.frozen || this.locked) {
      return;
    }

    const values = this.pendingVideoMutations.get(video);
    if (!values || id === -1) return;

    this.mutationCb({ id, type: CanvasContext['2D'], commands: values });

    this.pendingVideoMutations.delete(video);
  }
}
