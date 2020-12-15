import type {
  serializedNodeWithId,
  Mirror,
  INode,
  MaskInputOptions,
  SlimDOMOptions,
  MaskInputFn,
  MaskTextFn,
  DataURLOptions,
} from '@highlight-run/rrweb-snapshot';
import type { PackFn, UnpackFn } from './packer/base';
import type { IframeManager } from './record/iframe-manager';
import type { ShadowDomManager } from './record/shadow-dom-manager';
import type { Replayer } from './replay';
import type { RRNode } from '@highlight-run/rrdom';
import type { CanvasManager } from './record/observers/canvas/canvas-manager';
import type { StylesheetManager } from './record/stylesheet-manager';
import type {
  addedNodeMutation,
  blockClass,
  canvasMutationCallback,
  eventWithTime,
  fontCallback,
  hooksParam,
  inputCallback,
  IWindow,
  KeepIframeSrcFn,
  listenerHandler,
  maskTextClass,
  mediaInteractionCallback,
  mouseInteractionCallBack,
  mousemoveCallBack,
  mutationCallBack,
  RecordPlugin,
  SamplingStrategy,
  scrollCallback,
  selectionCallback,
  styleDeclarationCallback,
  styleSheetRuleCallback,
  viewportResizeCallback,
} from '@rrweb/types';

export type recordOptions<T> = {
  emit?: (e: T, isCheckout?: boolean) => void;
  checkoutEveryNth?: number;
  checkoutEveryNms?: number;
  blockClass?: blockClass;
  blockSelector?: string;
  ignoreClass?: string;
  maskTextClass?: maskTextClass;
  maskTextSelector?: string;
  maskAllInputs?: boolean;
  maskInputOptions?: MaskInputOptions;
  maskInputFn?: MaskInputFn;
  maskTextFn?: MaskTextFn;
  slimDOMOptions?: SlimDOMOptions | 'all' | true;
  ignoreCSSAttributes?: Set<string>;
  inlineStylesheet?: boolean;
  hooks?: hooksParam;
  packFn?: PackFn;
  sampling?: SamplingStrategy;
  dataURLOptions?: DataURLOptions;
  recordCanvas?: boolean;
  userTriggeredOnInput?: boolean;
  collectFonts?: boolean;
  inlineImages?: boolean;
  plugins?: RecordPlugin[];
  // departed, please use sampling options
  mousemoveWait?: number;
  keepIframeSrcFn?: KeepIframeSrcFn;
  /**
   * Enabling this will disable recording of text data on the page. This is useful if you do not want to record personally identifiable information.
   * Text will be randomized. Instead of seeing "Hello World" in a recording, you will see "1fds1 j59a0".
   */
  enableStrictPrivacy?: boolean;
};

export type observerParam = {
  mutationCb: mutationCallBack;
  mousemoveCb: mousemoveCallBack;
  mouseInteractionCb: mouseInteractionCallBack;
  scrollCb: scrollCallback;
  viewportResizeCb: viewportResizeCallback;
  inputCb: inputCallback;
  mediaInteractionCb: mediaInteractionCallback;
  selectionCb: selectionCallback;
  blockClass: blockClass;
  blockSelector: string | null;
  ignoreClass: string;
  maskTextClass: maskTextClass;
  maskTextSelector: string | null;
  maskInputOptions: MaskInputOptions;
  maskInputFn?: MaskInputFn;
  maskTextFn?: MaskTextFn;
  keepIframeSrcFn: KeepIframeSrcFn;
  inlineStylesheet: boolean;
  styleSheetRuleCb: styleSheetRuleCallback;
  styleDeclarationCb: styleDeclarationCallback;
  canvasMutationCb: canvasMutationCallback;
  fontCb: fontCallback;
  sampling: SamplingStrategy;
  recordCanvas: boolean;
  inlineImages: boolean;
  userTriggeredOnInput: boolean;
  collectFonts: boolean;
  slimDOMOptions: SlimDOMOptions;
  dataURLOptions: DataURLOptions;
  doc: Document;
  mirror: Mirror;
  iframeManager: IframeManager;
  stylesheetManager: StylesheetManager;
  shadowDomManager: ShadowDomManager;
  canvasManager: CanvasManager;
  enableStrictPrivacy: boolean;
  ignoreCSSAttributes: Set<string>;
  plugins: Array<{
    observer: (
      cb: (...arg: Array<unknown>) => void,
      win: IWindow,
      options: unknown,
    ) => listenerHandler;
    callback: (...arg: Array<unknown>) => void;
    options: unknown;
  }>;
};

export type MutationBufferParam = Pick<
  observerParam,
  | 'mutationCb'
  | 'blockClass'
  | 'blockSelector'
  | 'maskTextClass'
  | 'maskTextSelector'
  | 'inlineStylesheet'
  | 'maskInputOptions'
  | 'maskTextFn'
  | 'maskInputFn'
  | 'keepIframeSrcFn'
  | 'recordCanvas'
  | 'inlineImages'
  | 'slimDOMOptions'
  | 'dataURLOptions'
  | 'doc'
  | 'mirror'
  | 'iframeManager'
  | 'stylesheetManager'
  | 'shadowDomManager'
  | 'canvasManager'
  | 'enableStrictPrivacy'
>;

export type ReplayPlugin = {
  handler?: (
    event: eventWithTime,
    isSync: boolean,
    context: { replayer: Replayer },
  ) => void;
  onBuild?: (
    node: Node | RRNode,
    context: { id: number; replayer: Replayer },
  ) => void;
  getMirror?: (mirror: Mirror) => void;
};
export type playerConfig = {
  speed: number;
  maxSpeed: number;
  root: Element;
  loadTimeout: number;
  skipInactive: boolean;
  showWarning: boolean;
  showDebug: boolean;
  blockClass: string;
  liveMode: boolean;
  insertStyleRules: string[];
  triggerFocus: boolean;
  UNSAFE_replayCanvas: boolean;
  pauseAnimation?: boolean;
  mouseTail:
    | boolean
    | {
        duration?: number;
        lineCap?: string;
        lineWidth?: number;
        strokeStyle?: string;
      };
  unpackFn?: UnpackFn;
  useVirtualDom: boolean;
  plugins?: ReplayPlugin[];
  inactiveThreshold: number;
  inactiveSkipTime: number;
};

export type missingNode = {
  node: Node | RRNode;
  mutation: addedNodeMutation;
};
export type missingNodeMap = {
  [id: number]: missingNode;
};

declare global {
  interface Window {
    FontFace: typeof FontFace;
  }
}
