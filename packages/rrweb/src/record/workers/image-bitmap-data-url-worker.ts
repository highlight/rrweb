import { encode } from 'base64-arraybuffer';
import type { DataURLOptions } from '@highlight-run/rrweb-snapshot';
import type {
  ImageBitmapDataURLWorkerParams,
  ImageBitmapDataURLWorkerResponse,
} from '@highlight-run/rrweb-types';

const lastBlobMap: Map<number, string> = new Map();
const transparentBlobMap: Map<string, string> = new Map();

export interface ImageBitmapDataURLRequestWorker {
  postMessage: (
    message: ImageBitmapDataURLWorkerParams,
    transfer?: [ImageBitmap],
  ) => void;
  onmessage: (message: MessageEvent<ImageBitmapDataURLWorkerResponse>) => void;
  debug?: boolean;
}

interface ImageBitmapDataURLResponseWorker {
  onmessage:
    | null
    | ((message: MessageEvent<ImageBitmapDataURLWorkerParams>) => void);
  postMessage(e: ImageBitmapDataURLWorkerResponse): void;
  debug?: boolean;
}

async function getTransparentBlobFor(
  width: number,
  height: number,
  dataURLOptions: DataURLOptions,
): Promise<string> {
  const id = `${width}-${height}`;
  if ('OffscreenCanvas' in globalThis) {
    if (transparentBlobMap.has(id)) return transparentBlobMap.get(id)!;
    const offscreen = new OffscreenCanvas(width, height);
    offscreen.getContext('2d'); // creates rendering context for `converToBlob`
    const blob = await offscreen.convertToBlob(dataURLOptions); // takes a while
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = encode(arrayBuffer); // cpu intensive
    transparentBlobMap.set(id, base64);
    return base64;
  } else {
    return '';
  }
}

// `as any` because: https://github.com/Microsoft/TypeScript/issues/20595
const worker: ImageBitmapDataURLResponseWorker = self;

const debug = (...args: any[]) => {
  if (worker.debug) {
    console.debug(...args);
  }
};

// eslint-disable-next-line @typescript-eslint/no-misused-promises
worker.onmessage = async function (e) {
  if ('OffscreenCanvas' in globalThis) {
    const { id, bitmap, width, height, dx, dy, dw, dh, dataURLOptions } =
      e.data;

    const transparentBase64 = getTransparentBlobFor(
      width,
      height,
      dataURLOptions,
    );

    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d')!;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await offscreen.convertToBlob(dataURLOptions); // takes a while
    const type = blob.type;
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = encode(arrayBuffer); // cpu intensive

    // on first try we should check if canvas is transparent,
    // no need to save it's contents in that case
    if (!lastBlobMap.has(id) && (await transparentBase64) === base64) {
      debug('[highlight-worker] canvas bitmap is transparent', {
        id,
        base64,
      });
      lastBlobMap.set(id, base64);
      return worker.postMessage({ id, status: 'transparent' });
    }

    // unchanged
    if (lastBlobMap.get(id) === base64) {
      debug('[highlight-worker] canvas bitmap is unchanged', {
        id,
        base64,
      });
      return worker.postMessage({ id, status: 'unchanged' });
    }
    debug('[highlight-worker] canvas bitmap processed', {
      id,
      base64,
    });
    worker.postMessage({
      id,
      type,
      base64,
      width,
      height,
      dx,
      dy,
      dw,
      dh,
    });
    lastBlobMap.set(id, base64);
  } else {
    debug('[highlight-worker] no offscreencanvas support', {
      id: e.data.id,
    });
    return worker.postMessage({ id: e.data.id, status: 'unsupported' });
  }
};
