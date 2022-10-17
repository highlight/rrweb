import type {
  Mirror,
  serializedNodeWithId,
} from '@highlight-run/rrweb-snapshot';
import { genId } from '@highlight-run/rrweb-snapshot';
import {
  CrossOriginIframeMessageEvent,
  EventType,
  eventWithTime,
  IncrementalSource,
  mutationCallBack,
} from '../types';
import CrossOriginIframeMirror from './cross-origin-iframe-mirror';
import type { StylesheetManager } from './stylesheet-manager';

export class IframeManager {
  private iframes: WeakMap<HTMLIFrameElement, true> = new WeakMap();
  private crossOriginIframeMap: WeakMap<
    MessageEventSource,
    HTMLIFrameElement
  > = new WeakMap();
  public crossOriginIframeMirror = new CrossOriginIframeMirror(genId);
  public crossOriginIframeStyleMirror: CrossOriginIframeMirror;
  private mirror: Mirror;
  private mutationCb: mutationCallBack;
  private wrappedEmit: (e: eventWithTime, isCheckout?: boolean) => void;
  private loadListener?: (iframeEl: HTMLIFrameElement) => unknown;
  private stylesheetManager: StylesheetManager;
  private recordCrossOriginIframes: boolean;

  constructor(options: {
    mirror: Mirror;
    mutationCb: mutationCallBack;
    stylesheetManager: StylesheetManager;
    recordCrossOriginIframes: boolean;
    wrappedEmit: (e: eventWithTime, isCheckout?: boolean) => void;
  }) {
    this.mutationCb = options.mutationCb;
    this.wrappedEmit = options.wrappedEmit;
    this.stylesheetManager = options.stylesheetManager;
    this.recordCrossOriginIframes = options.recordCrossOriginIframes;
    this.crossOriginIframeStyleMirror = new CrossOriginIframeMirror(
      this.stylesheetManager.styleMirror.generateId.bind(
        this.stylesheetManager.styleMirror,
      ),
    );
    this.mirror = options.mirror;
    if (this.recordCrossOriginIframes) {
      window.addEventListener('message', this.handleMessage.bind(this));
    }
  }

  public addIframe(iframeEl: HTMLIFrameElement) {
    this.iframes.set(iframeEl, true);
    if (iframeEl.contentWindow)
      this.crossOriginIframeMap.set(iframeEl.contentWindow, iframeEl);
  }

  public addLoadListener(cb: (iframeEl: HTMLIFrameElement) => unknown) {
    this.loadListener = cb;
  }

  public attachIframe(
    iframeEl: HTMLIFrameElement,
    childSn: serializedNodeWithId,
  ) {
    this.mutationCb({
      adds: [
        {
          parentId: this.mirror.getId(iframeEl),
          nextId: null,
          node: childSn,
        },
      ],
      removes: [],
      texts: [],
      attributes: [],
      isAttachIframe: true,
    });
    this.loadListener?.(iframeEl);

    if (
      iframeEl.contentDocument &&
      iframeEl.contentDocument.adoptedStyleSheets &&
      iframeEl.contentDocument.adoptedStyleSheets.length > 0
    )
      this.stylesheetManager.adoptStyleSheets(
        iframeEl.contentDocument.adoptedStyleSheets,
        this.mirror.getId(iframeEl.contentDocument),
      );
  }
  private handleMessage(message: MessageEvent | CrossOriginIframeMessageEvent) {
    if ((message as CrossOriginIframeMessageEvent).data.type === 'rrweb') {
      const iframeSourceWindow = message.source;
      if (!iframeSourceWindow) return;

      const iframeEl = this.crossOriginIframeMap.get(message.source);
      if (!iframeEl) return;

      const transformedEvent = this.transformCrossOriginEvent(
        iframeEl,
        (message as CrossOriginIframeMessageEvent).data.event,
      );

      if (transformedEvent)
        this.wrappedEmit(
          transformedEvent,
          (message as CrossOriginIframeMessageEvent).data.isCheckout,
        );
    }
  }

  private transformCrossOriginEvent(
    iframeEl: HTMLIFrameElement,
    e: eventWithTime,
  ): eventWithTime | false {
    switch (e.type) {
      case EventType.FullSnapshot: {
        this.crossOriginIframeMirror.reset(iframeEl);
        this.crossOriginIframeStyleMirror.reset(iframeEl);
        /**
         * Replaces the original id of the iframe with a new set of unique ids
         */
        this.replaceIdOnNode(e.data.node, iframeEl);
        return {
          timestamp: e.timestamp,
          type: EventType.IncrementalSnapshot,
          data: {
            source: IncrementalSource.Mutation,
            adds: [
              {
                parentId: this.mirror.getId(iframeEl),
                nextId: null,
                node: e.data.node,
              },
            ],
            removes: [],
            texts: [],
            attributes: [],
            isAttachIframe: true,
          },
        };
      }
      case EventType.Meta:
      case EventType.Load:
      case EventType.DomContentLoaded: {
        return false;
      }
      case EventType.Plugin: {
        return e;
      }
      case EventType.Custom: {
        this.replaceIds(
          e.data.payload as {
            id?: unknown;
            parentId?: unknown;
            previousId?: unknown;
            nextId?: unknown;
          },
          iframeEl,
          ['id', 'parentId', 'previousId', 'nextId'],
        );
        return e;
      }
      case EventType.IncrementalSnapshot: {
        switch (e.data.source) {
          case IncrementalSource.Mutation: {
            e.data.adds.forEach((n) => {
              this.replaceIds(n, iframeEl, [
                'parentId',
                'nextId',
                'previousId',
              ]);
              this.replaceIdOnNode(n.node, iframeEl);
            });
            e.data.removes.forEach((n) => {
              this.replaceIds(n, iframeEl, ['parentId', 'id']);
            });
            e.data.attributes.forEach((n) => {
              this.replaceIds(n, iframeEl, ['id']);
            });
            e.data.texts.forEach((n) => {
              this.replaceIds(n, iframeEl, ['id']);
            });
            return e;
          }
          case IncrementalSource.Drag:
          case IncrementalSource.TouchMove:
          case IncrementalSource.MouseMove: {
            e.data.positions.forEach((p) => {
              this.replaceIds(p, iframeEl, ['id']);
            });
            return e;
          }
          case IncrementalSource.ViewportResize: {
            // can safely ignore these events
            return false;
          }
          case IncrementalSource.MediaInteraction:
          case IncrementalSource.MouseInteraction:
          case IncrementalSource.Scroll:
          case IncrementalSource.CanvasMutation:
          case IncrementalSource.Input: {
            this.replaceIds(e.data, iframeEl, ['id']);
            return e;
          }
          case IncrementalSource.StyleSheetRule:
          case IncrementalSource.StyleDeclaration: {
            this.replaceIds(e.data, iframeEl, ['id']);
            this.replaceStyleIds(e.data, iframeEl, ['styleId']);
            return e;
          }
          case IncrementalSource.Font: {
            // fine as-is no modification needed
            return e;
          }
          case IncrementalSource.Selection: {
            e.data.ranges.forEach((range) => {
              this.replaceIds(range, iframeEl, ['start', 'end']);
            });
            return e;
          }
          case IncrementalSource.AdoptedStyleSheet: {
            this.replaceIds(e.data, iframeEl, ['id']);
            this.replaceStyleIds(e.data, iframeEl, ['styleIds']);
            e.data.styles?.forEach((style) => {
              this.replaceStyleIds(style, iframeEl, ['styleId']);
            });
            return e;
          }
        }
      }
    }
  }

  private replace<T extends Record<string, unknown>>(
    iframeMirror: CrossOriginIframeMirror,
    obj: T,
    iframeEl: HTMLIFrameElement,
    keys: Array<keyof T>,
  ): T {
    for (const key of keys) {
      if (!Array.isArray(obj[key]) && typeof obj[key] !== 'number') continue;
      if (Array.isArray(obj[key])) {
        obj[key] = iframeMirror.getParentIds(
          iframeEl,
          obj[key] as number[],
        ) as T[keyof T];
      } else {
        (obj[key] as number) = iframeMirror.getParentId(
          iframeEl,
          obj[key] as number,
        );
      }
    }

    return obj;
  }

  private replaceIds<T extends Record<string, unknown>>(
    obj: T,
    iframeEl: HTMLIFrameElement,
    keys: Array<keyof T>,
  ): T {
    return this.replace(this.crossOriginIframeMirror, obj, iframeEl, keys);
  }

  private replaceStyleIds<T extends Record<string, unknown>>(
    obj: T,
    iframeEl: HTMLIFrameElement,
    keys: Array<keyof T>,
  ): T {
    return this.replace(this.crossOriginIframeStyleMirror, obj, iframeEl, keys);
  }

  private replaceIdOnNode(
    node: serializedNodeWithId,
    iframeEl: HTMLIFrameElement,
  ) {
    this.replaceIds(node, iframeEl, ['id']);
    if ('childNodes' in node) {
      node.childNodes.forEach((child) => {
        this.replaceIdOnNode(child, iframeEl);
      });
    }
  }
}
