import {
  INode,
  MaskInputOptions,
  SlimDOMOptions,
  maskInputValue,
  MaskInputFn,
  MaskTextFn,
  documentNode,
} from '../snapshot';
import { FontFaceDescriptors, FontFaceSet } from 'css-font-loading-module';
import {
  throttle,
  on,
  hookSetter,
  getWindowHeight,
  getWindowWidth,
  isBlocked,
  isTouchEvent,
  patch,
} from '../utils';
import {
  mutationCallBack,
  observerParam,
  mousemoveCallBack,
  mousePosition,
  mouseInteractionCallBack,
  MouseInteractions,
  listenerHandler,
  scrollCallback,
  styleSheetRuleCallback,
  viewportResizeCallback,
  inputValue,
  inputCallback,
  hookResetter,
  blockClass,
  maskTextClass,
  IncrementalSource,
  hooksParam,
  Arguments,
  mediaInteractionCallback,
  MediaInteractions,
  SamplingStrategy,
  canvasMutationCallback,
  fontCallback,
  fontParam,
  Mirror,
  styleDeclarationCallback,
} from '../types';
import MutationBuffer from './mutation';
import { IframeManager } from './iframe-manager';
import { ShadowDomManager } from './shadow-dom-manager';

type WindowWithStoredMutationObserver = Window & {
  __rrMutationObserver?: MutationObserver;
};
type WindowWithAngularZone = Window & {
  Zone?: {
    __symbol__?: (key: string) => string;
  };
};

export const mutationBuffers: MutationBuffer[] = [];

const isCSSGroupingRuleSupported = typeof CSSGroupingRule !== 'undefined';
const isCSSMediaRuleSupported = typeof CSSMediaRule !== 'undefined';
const isCSSSupportsRuleSupported = typeof CSSSupportsRule !== 'undefined';
const isCSSConditionRuleSupported = typeof CSSConditionRule !== 'undefined';

function getEventTarget(event: Event): EventTarget | null {
  try {
    if ('composedPath' in event) {
      const path = event.composedPath();
      if (path.length) {
        return path[0];
      }
    } else if (
      'path' in event &&
      (event as { path: EventTarget[] }).path.length
    ) {
      return (event as { path: EventTarget[] }).path[0];
    }
    return event.target;
  } catch {
    return event.target;
  }
}

export function initMutationObserver(
  cb: mutationCallBack,
  doc: Document,
  blockClass: blockClass,
  blockSelector: string | null,
  maskTextClass: maskTextClass,
  maskTextSelector: string | null,
  inlineStylesheet: boolean,
  maskInputOptions: MaskInputOptions,
  maskTextFn: MaskTextFn | undefined,
  maskInputFn: MaskInputFn | undefined,
  recordCanvas: boolean,
  slimDOMOptions: SlimDOMOptions,
  mirror: Mirror,
  iframeManager: IframeManager,
  shadowDomManager: ShadowDomManager,
  rootEl: Node,
  enableStrictPrivacy: boolean,
): MutationObserver {
  const mutationBuffer = new MutationBuffer();
  mutationBuffers.push(mutationBuffer);
  // see mutation.ts for details
  mutationBuffer.init(
    cb,
    blockClass,
    blockSelector,
    maskTextClass,
    maskTextSelector,
    inlineStylesheet,
    maskInputOptions,
    maskTextFn,
    maskInputFn,
    recordCanvas,
    slimDOMOptions,
    doc,
    mirror,
    iframeManager,
    shadowDomManager,
    enableStrictPrivacy,
  );
  let mutationObserverCtor =
    window.MutationObserver ||
    /**
     * Some websites may disable MutationObserver by removing it from the window object.
     * If someone is using rrweb to build a browser extention or things like it, they
     * could not change the website's code but can have an opportunity to inject some
     * code before the website executing its JS logic.
     * Then they can do this to store the native MutationObserver:
     * window.__rrMutationObserver = MutationObserver
     */
    (window as WindowWithStoredMutationObserver).__rrMutationObserver;
  const angularZoneSymbol = (window as WindowWithAngularZone)?.Zone?.__symbol__?.(
    'MutationObserver',
  );
  if (
    angularZoneSymbol &&
    ((window as unknown) as Record<string, typeof MutationObserver>)[
      angularZoneSymbol
    ]
  ) {
    mutationObserverCtor = ((window as unknown) as Record<
      string,
      typeof MutationObserver
    >)[angularZoneSymbol];
  }
  const observer = new mutationObserverCtor(
    mutationBuffer.processMutations.bind(mutationBuffer),
  );
  observer.observe(rootEl, {
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true,
    childList: true,
    subtree: true,
  });
  return observer;
}

function initMoveObserver(
  cb: mousemoveCallBack,
  sampling: SamplingStrategy,
  doc: Document,
  mirror: Mirror,
): listenerHandler {
  if (sampling.mousemove === false) {
    return () => {};
  }

  const threshold =
    typeof sampling.mousemove === 'number' ? sampling.mousemove : 50;
  const callbackThreshold =
    typeof sampling.mousemoveCallback === 'number'
      ? sampling.mousemoveCallback
      : 500;

  let positions: mousePosition[] = [];
  let timeBaseline: number | null;
  const wrappedCb = throttle(
    (
      source:
        | IncrementalSource.MouseMove
        | IncrementalSource.TouchMove
        | IncrementalSource.Drag,
    ) => {
      const totalOffset = Date.now() - timeBaseline!;
      cb(
        positions.map((p) => {
          p.timeOffset -= totalOffset;
          return p;
        }),
        source,
      );
      positions = [];
      timeBaseline = null;
    },
    callbackThreshold,
  );
  // update position for mouse, touch, and drag events (drag event extends mouse event)
  function handleUpdatePositionEvent(evt: MouseEvent | TouchEvent) {
    const target = getEventTarget(evt);
    const { clientX, clientY } = isTouchEvent(evt)
      ? evt.changedTouches[0]
      : evt;
    if (!timeBaseline) {
      timeBaseline = Date.now();
    }
    positions.push({
      x: clientX,
      y: clientY,
      id: mirror.getId(target as INode),
      timeOffset: Date.now() - timeBaseline,
    });
  }

  // separate call for non-drag events, in case DragEvent is not defined
  const updatePosition = throttle<MouseEvent | TouchEvent>(
    (evt) => {
      handleUpdatePositionEvent(evt);
      wrappedCb(
        evt instanceof DragEvent
          ? IncrementalSource.Drag
          : evt instanceof MouseEvent
          ? IncrementalSource.MouseMove
          : IncrementalSource.TouchMove,
      );
    },
    threshold,
    {
      trailing: false,
    },
  );
  // call for drag events, when DragEvent is defined
  const updateDragPosition = throttle<MouseEvent | TouchEvent | DragEvent>(
    (evt) => {
      handleUpdatePositionEvent(evt);
      wrappedCb(
        evt instanceof DragEvent
          ? IncrementalSource.Drag
          : evt instanceof MouseEvent
          ? IncrementalSource.MouseMove
          : IncrementalSource.TouchMove,
      );
    },
    threshold,
    {
      trailing: false,
    },
  );
  // it is possible DragEvent is undefined even on devices
  // that support event 'drag'
  const dragEventDefined = typeof DragEvent !== 'undefined';
  const handlers = [
    on('mousemove', updatePosition, doc),
    on('touchmove', updatePosition, doc),
    on('drag', dragEventDefined ? updateDragPosition : updatePosition, doc),
  ];
  return () => {
    handlers.forEach((h) => h());
  };
}

function initMouseInteractionObserver(
  cb: mouseInteractionCallBack,
  doc: Document,
  mirror: Mirror,
  blockClass: blockClass,
  sampling: SamplingStrategy,
): listenerHandler {
  if (sampling.mouseInteraction === false) {
    return () => {};
  }
  const disableMap: Record<string, boolean | undefined> =
    sampling.mouseInteraction === true ||
    sampling.mouseInteraction === undefined
      ? {}
      : sampling.mouseInteraction;

  const handlers: listenerHandler[] = [];
  const getHandler = (eventKey: keyof typeof MouseInteractions) => {
    return (event: MouseEvent | TouchEvent) => {
      const target = getEventTarget(event) as Node;
      if (isBlocked(target as Node, blockClass)) {
        return;
      }
      const e = isTouchEvent(event) ? event.changedTouches[0] : event;
      if (!e) {
        return;
      }
      const id = mirror.getId(target as INode);
      const { clientX, clientY } = e;
      cb({
        type: MouseInteractions[eventKey],
        id,
        x: clientX,
        y: clientY,
      });
    };
  };
  Object.keys(MouseInteractions)
    .filter(
      (key) =>
        Number.isNaN(Number(key)) &&
        !key.endsWith('_Departed') &&
        disableMap[key] !== false,
    )
    .forEach((eventKey: keyof typeof MouseInteractions) => {
      const eventName = eventKey.toLowerCase();
      const handler = getHandler(eventKey);
      handlers.push(on(eventName, handler, doc));
    });
  return () => {
    handlers.forEach((h) => h());
  };
}

export function initScrollObserver(
  cb: scrollCallback,
  doc: Document,
  mirror: Mirror,
  blockClass: blockClass,
  sampling: SamplingStrategy,
): listenerHandler {
  const updatePosition = throttle<UIEvent>((evt) => {
    const target = getEventTarget(evt);
    if (!target || isBlocked(target as Node, blockClass)) {
      return;
    }
    const id = mirror.getId(target as INode);
    if (target === doc) {
      const scrollEl = (doc.scrollingElement || doc.documentElement)!;
      cb({
        id,
        x: scrollEl.scrollLeft,
        y: scrollEl.scrollTop,
      });
    } else {
      cb({
        id,
        x: (target as HTMLElement).scrollLeft,
        y: (target as HTMLElement).scrollTop,
      });
    }
  }, sampling.scroll || 100);
  return on('scroll', updatePosition, doc);
}

function initViewportResizeObserver(
  cb: viewportResizeCallback,
): listenerHandler {
  let lastH = -1;
  let lastW = -1;
  const updateDimension = throttle(() => {
    const height = getWindowHeight();
    const width = getWindowWidth();
    if (lastH !== height || lastW !== width) {
      cb({
        width: Number(width),
        height: Number(height),
      });
      lastH = height;
      lastW = width;
    }
  }, 200);
  return on('resize', updateDimension, window);
}

function wrapEventWithUserTriggeredFlag(
  v: inputValue,
  enable: boolean,
): inputValue {
  const value = { ...v };
  if (!enable) delete value.userTriggered;
  return value;
}

export const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
const lastInputValueMap: WeakMap<EventTarget, inputValue> = new WeakMap();
function initInputObserver(
  cb: inputCallback,
  doc: Document,
  mirror: Mirror,
  blockClass: blockClass,
  ignoreClass: string,
  maskInputOptions: MaskInputOptions,
  maskInputFn: MaskInputFn | undefined,
  sampling: SamplingStrategy,
  userTriggeredOnInput: boolean,
): listenerHandler {
  function eventHandler(event: Event) {
    const target = getEventTarget(event);
    const userTriggered = event.isTrusted;
    if (
      !target ||
      !(target as Element).tagName ||
      INPUT_TAGS.indexOf((target as Element).tagName) < 0 ||
      isBlocked(target as Node, blockClass)
    ) {
      return;
    }
    const type: string | undefined = (target as HTMLInputElement).type;
    if ((target as HTMLElement).classList.contains(ignoreClass)) {
      return;
    }
    let text = (target as HTMLInputElement).value;
    let isChecked = false;
    if (type === 'radio' || type === 'checkbox') {
      isChecked = (target as HTMLInputElement).checked;
    } else if (
      maskInputOptions[
        (target as Element).tagName.toLowerCase() as keyof MaskInputOptions
      ] ||
      maskInputOptions[type as keyof MaskInputOptions]
    ) {
      text = maskInputValue({
        maskInputOptions,
        tagName: (target as HTMLElement).tagName,
        type,
        value: text,
        maskInputFn,
      });
    }
    cbWithDedup(
      target,
      wrapEventWithUserTriggeredFlag(
        { text, isChecked, userTriggered },
        userTriggeredOnInput,
      ),
    );
    // if a radio was checked
    // the other radios with the same name attribute will be unchecked.
    const name: string | undefined = (target as HTMLInputElement).name;
    if (type === 'radio' && name && isChecked) {
      doc
        .querySelectorAll(`input[type="radio"][name="${name}"]`)
        .forEach((el) => {
          if (el !== target) {
            cbWithDedup(
              el,
              wrapEventWithUserTriggeredFlag(
                {
                  text: (el as HTMLInputElement).value,
                  isChecked: !isChecked,
                  userTriggered: false,
                },
                userTriggeredOnInput,
              ),
            );
          }
        });
    }
  }
  function cbWithDedup(target: EventTarget, v: inputValue) {
    const lastInputValue = lastInputValueMap.get(target);
    if (
      !lastInputValue ||
      lastInputValue.text !== v.text ||
      lastInputValue.isChecked !== v.isChecked
    ) {
      lastInputValueMap.set(target, v);
      const id = mirror.getId(target as INode);
      cb({
        ...v,
        id,
      });
    }
  }
  const events = sampling.input === 'last' ? ['change'] : ['input', 'change'];
  const handlers: Array<
    listenerHandler | hookResetter
  > = events.map((eventName) => on(eventName, eventHandler, doc));
  const propertyDescriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  );
  const hookProperties: Array<[HTMLElement, string]> = [
    [HTMLInputElement.prototype, 'value'],
    [HTMLInputElement.prototype, 'checked'],
    [HTMLSelectElement.prototype, 'value'],
    [HTMLTextAreaElement.prototype, 'value'],
    // Some UI library use selectedIndex to set select value
    [HTMLSelectElement.prototype, 'selectedIndex'],
  ];
  if (propertyDescriptor && propertyDescriptor.set) {
    handlers.push(
      ...hookProperties.map((p) =>
        hookSetter<HTMLElement>(p[0], p[1], {
          set() {
            // mock to a normal event
            eventHandler({ target: this } as Event);
          },
        }),
      ),
    );
  }
  return () => {
    handlers.forEach((h) => h());
  };
}

type GroupingCSSRule =
  | CSSGroupingRule
  | CSSMediaRule
  | CSSSupportsRule
  | CSSConditionRule;
type GroupingCSSRuleTypes =
  | typeof CSSGroupingRule
  | typeof CSSMediaRule
  | typeof CSSSupportsRule
  | typeof CSSConditionRule;

function getNestedCSSRulePositions(rule: CSSRule): number[] {
  const positions: number[] = [];
  function recurse(childRule: CSSRule, pos: number[]) {
    if (
      isCSSGroupingRuleSupported &&
      childRule.parentRule instanceof CSSGroupingRule
    ) {
      const rules = Array.from(
        (childRule.parentRule as CSSGroupingRule).cssRules,
      );
      const index = rules.indexOf(childRule);
      pos.unshift(index);
    } else {
      const rules = Array.from(childRule.parentStyleSheet!.cssRules);
      const index = rules.indexOf(childRule);
      pos.unshift(index);
    }
    return pos;
  }
  return recurse(rule, positions);
}

function initStyleSheetObserver(
  cb: styleSheetRuleCallback,
  win: Window,
  mirror: Mirror,
): listenerHandler {
  const insertRule = (win as any).CSSStyleSheet.prototype.insertRule;
  (win as any).CSSStyleSheet.prototype.insertRule = function (
    rule: string,
    index?: number,
  ) {
    const id = mirror.getId(this.ownerNode as INode);
    if (id !== -1) {
      cb({
        id,
        adds: [{ rule, index }],
      });
    }
    return insertRule.apply(this, arguments);
  };

  const deleteRule = (win as any).CSSStyleSheet.prototype.deleteRule;
  (win as any).CSSStyleSheet.prototype.deleteRule = function (index: number) {
    const id = mirror.getId(this.ownerNode as INode);
    if (id !== -1) {
      cb({
        id,
        removes: [{ index }],
      });
    }
    return deleteRule.apply(this, arguments);
  };

  const supportedNestedCSSRuleTypes: {
    [key: string]: GroupingCSSRuleTypes;
  } = {};
  if (isCSSGroupingRuleSupported) {
    supportedNestedCSSRuleTypes[
      'CSSGroupingRule'
    ] = (win as any).CSSGroupingRule;
  } else {
    // Some browsers (Safari) don't support CSSGroupingRule
    // https://caniuse.com/?search=cssgroupingrule
    // fall back to monkey patching classes that would have inherited from CSSGroupingRule

    if (isCSSMediaRuleSupported) {
      supportedNestedCSSRuleTypes['CSSMediaRule'] = (win as any).CSSMediaRule;
    }
    if (isCSSConditionRuleSupported) {
      supportedNestedCSSRuleTypes[
        'CSSConditionRule'
      ] = (win as any).CSSConditionRule;
    }
    if (isCSSSupportsRuleSupported) {
      supportedNestedCSSRuleTypes[
        'CSSSupportsRule'
      ] = (win as any).CSSSupportsRule;
    }
  }

  const unmodifiedFunctions: {
    [key: string]: {
      insertRule: (rule: string, index?: number) => number;
      deleteRule: (index: number) => void;
    };
  } = {};

  Object.entries(supportedNestedCSSRuleTypes).forEach(([typeKey, type]) => {
    unmodifiedFunctions[typeKey] = {
      insertRule: (type as GroupingCSSRuleTypes).prototype.insertRule,
      deleteRule: (type as GroupingCSSRuleTypes).prototype.deleteRule,
    };

    type.prototype.insertRule = function (rule: string, index?: number) {
      const id = mirror.getId(this.parentStyleSheet.ownerNode as INode);
      if (id !== -1) {
        cb({
          id,
          adds: [
            {
              rule,
              index: [
                ...getNestedCSSRulePositions(this),
                index || 0, // defaults to 0
              ],
            },
          ],
        });
      }
      return unmodifiedFunctions[typeKey].insertRule.apply(this, arguments);
    };

    type.prototype.deleteRule = function (index: number) {
      const id = mirror.getId(this.parentStyleSheet.ownerNode as INode);
      if (id !== -1) {
        cb({
          id,
          removes: [{ index: [...getNestedCSSRulePositions(this), index] }],
        });
      }
      return unmodifiedFunctions[typeKey].deleteRule.apply(this, arguments);
    };
  });

  return () => {
    (win as any).CSSStyleSheet.prototype.insertRule = insertRule;
    (win as any).CSSStyleSheet.prototype.deleteRule = deleteRule;
    Object.entries(supportedNestedCSSRuleTypes).forEach(([typeKey, type]) => {
      type.prototype.insertRule = unmodifiedFunctions[typeKey].insertRule;
      type.prototype.deleteRule = unmodifiedFunctions[typeKey].deleteRule;
    });
  };
}

function initStyleDeclarationObserver(
  cb: styleDeclarationCallback,
  win: Window,
  mirror: Mirror,
): listenerHandler {
  const setProperty = (win as any).CSSStyleDeclaration.prototype.setProperty;
  (win as any).CSSStyleDeclaration.prototype.setProperty = function (
    this: CSSStyleDeclaration,
    property: string,
    value: string,
    priority: string,
  ) {
    const id = mirror.getId(
      (this.parentRule?.parentStyleSheet?.ownerNode as unknown) as INode,
    );
    if (id !== -1) {
      cb({
        id,
        set: {
          property,
          value,
          priority,
        },
        index: getNestedCSSRulePositions(this.parentRule!),
      });
    }
    return setProperty.apply(this, arguments);
  };

  const removeProperty = (win as any).CSSStyleDeclaration.prototype
    .removeProperty;
  (win as any).CSSStyleDeclaration.prototype.removeProperty = function (
    this: CSSStyleDeclaration,
    property: string,
  ) {
    const id = mirror.getId(
      (this.parentRule?.parentStyleSheet?.ownerNode as unknown) as INode,
    );
    if (id !== -1) {
      cb({
        id,
        remove: {
          property,
        },
        index: getNestedCSSRulePositions(this.parentRule!),
      });
    }
    return removeProperty.apply(this, arguments);
  };

  return () => {
    (win as any).CSSStyleDeclaration.prototype.setProperty = setProperty;
    (win as any).CSSStyleDeclaration.prototype.removeProperty = removeProperty;
  };
}

function initMediaInteractionObserver(
  mediaInteractionCb: mediaInteractionCallback,
  blockClass: blockClass,
  mirror: Mirror,
): listenerHandler {
  const handler = (type: MediaInteractions) => (event: Event) => {
    const target = getEventTarget(event);
    if (!target || isBlocked(target as Node, blockClass)) {
      return;
    }
    mediaInteractionCb({
      type,
      id: mirror.getId(target as INode),
      currentTime: (target as HTMLMediaElement).currentTime,
    });
  };
  const handlers = [
    on('play', handler(MediaInteractions.Play)),
    on('pause', handler(MediaInteractions.Pause)),
    on('seeked', handler(MediaInteractions.Seeked)),
  ];
  return () => {
    handlers.forEach((h) => h());
  };
}

function initCanvasMutationObserver(
  cb: canvasMutationCallback,
  win: Window,
  blockClass: blockClass,
  mirror: Mirror,
): listenerHandler {
  const props = Object.getOwnPropertyNames(
    (win as any).CanvasRenderingContext2D.prototype,
  );
  const handlers: listenerHandler[] = [];
  for (const prop of props) {
    try {
      if (
        typeof (win as any).CanvasRenderingContext2D.prototype[
          prop as keyof CanvasRenderingContext2D
        ] !== 'function'
      ) {
        continue;
      }
      const restoreHandler = patch(
        (win as any).CanvasRenderingContext2D.prototype,
        prop,
        function (original) {
          return function (
            this: CanvasRenderingContext2D,
            ...args: Array<unknown>
          ) {
            if (!isBlocked(this.canvas, blockClass)) {
              setTimeout(() => {
                const recordArgs = [...args];
                if (prop === 'drawImage') {
                  if (
                    recordArgs[0] &&
                    recordArgs[0] instanceof HTMLCanvasElement
                  ) {
                    const canvas = recordArgs[0];
                    const ctx = canvas.getContext('2d');
                    let imgd = ctx?.getImageData(
                      0,
                      0,
                      canvas.width,
                      canvas.height,
                    );
                    let pix = imgd?.data;
                    recordArgs[0] = JSON.stringify(pix);
                  }
                }
                cb({
                  id: mirror.getId((this.canvas as unknown) as INode),
                  property: prop,
                  args: recordArgs,
                });
              }, 0);
            }
            return original.apply(this, args);
          };
        },
      );
      handlers.push(restoreHandler);
    } catch {
      const hookHandler = hookSetter<CanvasRenderingContext2D>(
        (win as any).CanvasRenderingContext2D.prototype,
        prop,
        {
          set(v) {
            cb({
              id: mirror.getId((this.canvas as unknown) as INode),
              property: prop,
              args: [v],
              setter: true,
            });
          },
        },
      );
      handlers.push(hookHandler);
    }
  }
  return () => {
    handlers.forEach((h) => h());
  };
}

function initFontObserver(cb: fontCallback, doc: Document): listenerHandler {
  const win = doc.defaultView;
  const handlers: listenerHandler[] = [];

  const fontMap = new WeakMap<FontFace, fontParam>();

  const originalFontFace = (win as any).FontFace;
  // tslint:disable-next-line: no-any
  (win as any).FontFace = function FontFace(
    family: string,
    source: string | ArrayBufferView,
    descriptors?: FontFaceDescriptors,
  ) {
    const fontFace = new originalFontFace(family, source, descriptors);
    fontMap.set(fontFace, {
      family,
      buffer: typeof source !== 'string',
      descriptors,
      fontSource:
        typeof source === 'string'
          ? source
          : // tslint:disable-next-line: no-any
            JSON.stringify(Array.from(new Uint8Array(source as any))),
    });
    return fontFace;
  };

  const restoreHandler = patch(doc.fonts, 'add', function (original) {
    return function (this: FontFaceSet, fontFace: FontFace) {
      setTimeout(() => {
        const p = fontMap.get(fontFace);
        if (p) {
          cb(p);
          fontMap.delete(fontFace);
        }
      }, 0);
      return original.apply(this, [fontFace]);
    };
  });

  handlers.push(() => {
    // tslint:disable-next-line: no-any
    (win as any).FonFace = originalFontFace;
  });
  handlers.push(restoreHandler);

  return () => {
    handlers.forEach((h) => h());
  };
}

function mergeHooks(o: observerParam, hooks: hooksParam) {
  const {
    mutationCb,
    mousemoveCb,
    mouseInteractionCb,
    scrollCb,
    viewportResizeCb,
    inputCb,
    mediaInteractionCb,
    styleSheetRuleCb,
    styleDeclarationCb,
    canvasMutationCb,
    fontCb,
  } = o;
  o.mutationCb = (...p: Arguments<mutationCallBack>) => {
    if (hooks.mutation) {
      hooks.mutation(...p);
    }
    mutationCb(...p);
  };
  o.mousemoveCb = (...p: Arguments<mousemoveCallBack>) => {
    if (hooks.mousemove) {
      hooks.mousemove(...p);
    }
    mousemoveCb(...p);
  };
  o.mouseInteractionCb = (...p: Arguments<mouseInteractionCallBack>) => {
    if (hooks.mouseInteraction) {
      hooks.mouseInteraction(...p);
    }
    mouseInteractionCb(...p);
  };
  o.scrollCb = (...p: Arguments<scrollCallback>) => {
    if (hooks.scroll) {
      hooks.scroll(...p);
    }
    scrollCb(...p);
  };
  o.viewportResizeCb = (...p: Arguments<viewportResizeCallback>) => {
    if (hooks.viewportResize) {
      hooks.viewportResize(...p);
    }
    viewportResizeCb(...p);
  };
  o.inputCb = (...p: Arguments<inputCallback>) => {
    if (hooks.input) {
      hooks.input(...p);
    }
    inputCb(...p);
  };
  o.mediaInteractionCb = (...p: Arguments<mediaInteractionCallback>) => {
    if (hooks.mediaInteaction) {
      hooks.mediaInteaction(...p);
    }
    mediaInteractionCb(...p);
  };
  o.styleSheetRuleCb = (...p: Arguments<styleSheetRuleCallback>) => {
    if (hooks.styleSheetRule) {
      hooks.styleSheetRule(...p);
    }
    styleSheetRuleCb(...p);
  };
  o.styleDeclarationCb = (...p: Arguments<styleDeclarationCallback>) => {
    if (hooks.styleDeclaration) {
      hooks.styleDeclaration(...p);
    }
    styleDeclarationCb(...p);
  };
  o.canvasMutationCb = (...p: Arguments<canvasMutationCallback>) => {
    if (hooks.canvasMutation) {
      hooks.canvasMutation(...p);
    }
    canvasMutationCb(...p);
  };
  o.fontCb = (...p: Arguments<fontCallback>) => {
    if (hooks.font) {
      hooks.font(...p);
    }
    fontCb(...p);
  };
}

export function initObservers(
  o: observerParam,
  hooks: hooksParam = {},
): listenerHandler {
  mergeHooks(o, hooks);
  const mutationObserver = initMutationObserver(
    o.mutationCb,
    o.doc,
    o.blockClass,
    o.blockSelector,
    o.maskTextClass,
    o.maskTextSelector,
    o.inlineStylesheet,
    o.maskInputOptions,
    o.maskTextFn,
    o.maskInputFn,
    o.recordCanvas,
    o.slimDOMOptions,
    o.mirror,
    o.iframeManager,
    o.shadowDomManager,
    o.doc,
    o.enableStrictPrivacy,
  );
  const mousemoveHandler = initMoveObserver(
    o.mousemoveCb,
    o.sampling,
    o.doc,
    o.mirror,
  );
  const mouseInteractionHandler = initMouseInteractionObserver(
    o.mouseInteractionCb,
    o.doc,
    o.mirror,
    o.blockClass,
    o.sampling,
  );
  const scrollHandler = initScrollObserver(
    o.scrollCb,
    o.doc,
    o.mirror,
    o.blockClass,
    o.sampling,
  );
  const viewportResizeHandler = initViewportResizeObserver(o.viewportResizeCb);
  const inputHandler = initInputObserver(
    o.inputCb,
    o.doc,
    o.mirror,
    o.blockClass,
    o.ignoreClass,
    o.maskInputOptions,
    o.maskInputFn,
    o.sampling,
    o.userTriggeredOnInput,
  );
  const mediaInteractionHandler = initMediaInteractionObserver(
    o.mediaInteractionCb,
    o.blockClass,
    o.mirror,
  );

  const currentWindow = o.doc.defaultView as Window; // basically document.window

  const styleSheetObserver = initStyleSheetObserver(
    o.styleSheetRuleCb,
    currentWindow,
    o.mirror,
  );
  const styleDeclarationObserver = initStyleDeclarationObserver(
    o.styleDeclarationCb,
    currentWindow,
    o.mirror,
  );
  const canvasMutationObserver = o.recordCanvas
    ? initCanvasMutationObserver(
        o.canvasMutationCb,
        currentWindow,
        o.blockClass,
        o.mirror,
      )
    : () => {};
  const fontObserver = o.collectFonts
    ? initFontObserver(o.fontCb, o.doc)
    : () => {};
  // plugins
  const pluginHandlers: listenerHandler[] = [];
  for (const plugin of o.plugins) {
    pluginHandlers.push(
      plugin.observer(plugin.callback, currentWindow, plugin.options),
    );
  }

  return () => {
    mutationObserver.disconnect();
    mousemoveHandler();
    mouseInteractionHandler();
    scrollHandler();
    viewportResizeHandler();
    inputHandler();
    mediaInteractionHandler();
    styleSheetObserver();
    styleDeclarationObserver();
    canvasMutationObserver();
    fontObserver();
    pluginHandlers.forEach((h) => h());
  };
}
