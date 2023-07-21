import type { ICanvas } from '@highlight-run/rrweb-snapshot';
import type {
  blockClass,
  IWindow,
  listenerHandler,
} from '@highlight-run/rrweb-types';
import { isBlocked, patch } from '../../../utils';

export default function initCanvasContextObserver(
  win: IWindow,
  blockClass: blockClass,
  blockSelector: string | null,
): listenerHandler {
  const handlers: listenerHandler[] = [];
  try {
    const restoreGetContext = patch(
      win.HTMLCanvasElement.prototype,
      'getContext',
      function (
        original: (
          this: ICanvas,
          contextType: string,
          ...args: Array<unknown>
        ) => unknown,
      ) {
        return function (
          this: ICanvas,
          contextType: string,
          ...args: Array<unknown>
        ) {
          const ctx = original.apply(this, [contextType, ...args]);
          if (ctx) {
            if (!isBlocked(this, blockClass, blockSelector, true)) {
              if (!this.__context) this.__context = contextType;
            }
          }
          return ctx;
        };
      },
    );
    handlers.push(restoreGetContext);
  } catch {
    console.error('failed to patch HTMLCanvasElement.prototype.getContext');
  }
  return () => {
    handlers.forEach((h) => h());
  };
}
