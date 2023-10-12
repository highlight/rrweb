import {
  idNodeMap,
  MaskInputFn,
  MaskInputOptions,
  nodeMetaMap,
  IMirror,
  serializedNodeWithId,
  serializedNode,
  NodeType,
  documentNode,
  documentTypeNode,
  textNode,
  elementNode,
} from './types';

export function isElement(n: Node): n is Element {
  return n.nodeType === n.ELEMENT_NODE;
}

export function isShadowRoot(n: Node): n is ShadowRoot {
  const host: Element | null = (n as ShadowRoot)?.host;
  return Boolean(host?.shadowRoot === n);
}

/**
 * To fix the issue https://github.com/rrweb-io/rrweb/issues/933.
 * Some websites use polyfilled shadow dom and this function is used to detect this situation.
 */
export function isNativeShadowDom(shadowRoot: ShadowRoot) {
  return Object.prototype.toString.call(shadowRoot) === '[object ShadowRoot]';
}

/**
 * Browsers sometimes destructively modify the css rules they receive.
 * This function tries to rectify the modifications the browser made to make it more cross platform compatible.
 * @param cssText - output of `CSSStyleRule.cssText`
 * @returns `cssText` with browser inconsistencies fixed.
 */
function fixBrowserCompatibilityIssuesInCSS(cssText: string): string {
  /**
   * Chrome outputs `-webkit-background-clip` as `background-clip` in `CSSStyleRule.cssText`.
   * But then Chrome ignores `background-clip` as css input.
   * Re-introduce `-webkit-background-clip` to fix this issue.
   */
  if (
    cssText.includes(' background-clip: text;') &&
    !cssText.includes(' -webkit-background-clip: text;')
  ) {
    cssText = cssText.replace(
      ' background-clip: text;',
      ' -webkit-background-clip: text; background-clip: text;',
    );
  }
  return cssText;
}

export function getCssRulesString(s: CSSStyleSheet): string | null {
  try {
    const rules = s.rules || s.cssRules;
    return rules
      ? fixBrowserCompatibilityIssuesInCSS(
          Array.from(rules).map(getCssRuleString).join(''),
        )
      : null;
  } catch (error) {
    return null;
  }
}

export function getCssRuleString(rule: CSSRule): string {
  let cssStringified = rule.cssText;
  if (isCSSImportRule(rule)) {
    try {
      cssStringified = getCssRulesString(rule.styleSheet) || cssStringified;
    } catch {
      // ignore
    }
  }
  return cssStringified;
}

export function isCSSImportRule(rule: CSSRule): rule is CSSImportRule {
  return 'styleSheet' in rule;
}

export class Mirror implements IMirror<Node> {
  private idNodeMap: idNodeMap = new Map();
  private nodeMetaMap: nodeMetaMap = new WeakMap();

  getId(n: Node | undefined | null): number {
    if (!n) return -1;

    const id = this.getMeta(n)?.id;

    // if n is not a serialized Node, use -1 as its id.
    return id ?? -1;
  }

  getNode(id: number): Node | null {
    return this.idNodeMap.get(id) || null;
  }

  getIds(): number[] {
    return Array.from(this.idNodeMap.keys());
  }

  getMeta(n: Node): serializedNodeWithId | null {
    return this.nodeMetaMap.get(n) || null;
  }

  // removes the node from idNodeMap
  // doesn't remove the node from nodeMetaMap
  removeNodeFromMap(n: Node) {
    const id = this.getId(n);
    this.idNodeMap.delete(id);

    if (n.childNodes) {
      n.childNodes.forEach((childNode) =>
        this.removeNodeFromMap(childNode as unknown as Node),
      );
    }
  }
  has(id: number): boolean {
    return this.idNodeMap.has(id);
  }

  hasNode(node: Node): boolean {
    return this.nodeMetaMap.has(node);
  }

  add(n: Node, meta: serializedNodeWithId) {
    const id = meta.id;
    this.idNodeMap.set(id, n);
    this.nodeMetaMap.set(n, meta);
  }

  replace(id: number, n: Node) {
    const oldNode = this.getNode(id);
    if (oldNode) {
      const meta = this.nodeMetaMap.get(oldNode);
      if (meta) this.nodeMetaMap.set(n, meta);
    }
    this.idNodeMap.set(id, n);
  }

  reset() {
    this.idNodeMap = new Map();
    this.nodeMetaMap = new WeakMap();
  }
}

export function createMirror(): Mirror {
  return new Mirror();
}

const ORIGINAL_ATTRIBUTE_NAME = '__rrweb_original__';
type PatchedGetImageData = {
  [ORIGINAL_ATTRIBUTE_NAME]: CanvasImageData['getImageData'];
} & CanvasImageData['getImageData'];

export function is2DCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;

  const chunkSize = 50;

  // get chunks of the canvas and check if it is blank
  for (let x = 0; x < canvas.width; x += chunkSize) {
    for (let y = 0; y < canvas.height; y += chunkSize) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const getImageData = ctx.getImageData as PatchedGetImageData;
      const originalGetImageData =
        ORIGINAL_ATTRIBUTE_NAME in getImageData
          ? getImageData[ORIGINAL_ATTRIBUTE_NAME]
          : getImageData;
      // by getting the canvas in chunks we avoid an expensive
      // `getImageData` call that retrieves everything
      // even if we can already tell from the first chunk(s) that
      // the canvas isn't blank
      const pixelBuffer = new Uint32Array(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        originalGetImageData.call(
          ctx,
          x,
          y,
          Math.min(chunkSize, canvas.width - x),
          Math.min(chunkSize, canvas.height - y),
        ).data.buffer,
      );
      if (pixelBuffer.some((pixel) => pixel !== 0)) return false;
    }
  }
  return true;
}

export function isNodeMetaEqual(a: serializedNode, b: serializedNode): boolean {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === NodeType.Document)
    return a.compatMode === (b as documentNode).compatMode;
  else if (a.type === NodeType.DocumentType)
    return (
      a.name === (b as documentTypeNode).name &&
      a.publicId === (b as documentTypeNode).publicId &&
      a.systemId === (b as documentTypeNode).systemId
    );
  else if (
    a.type === NodeType.Comment ||
    a.type === NodeType.Text ||
    a.type === NodeType.CDATA
  )
    return a.textContent === (b as textNode).textContent;
  else if (a.type === NodeType.Element)
    return (
      a.tagName === (b as elementNode).tagName &&
      JSON.stringify(a.attributes) ===
        JSON.stringify((b as elementNode).attributes) &&
      a.isSVG === (b as elementNode).isSVG &&
      a.needBlock === (b as elementNode).needBlock
    );
  return false;
}

/**
 * Get the type of an input element.
 * This takes care of the case where a password input is changed to a text input.
 * In this case, we continue to consider this of type password, in order to avoid leaking sensitive data
 * where passwords should be masked.
 */
export function getInputType(element: HTMLElement): Lowercase<string> | null {
  const type = (element as HTMLInputElement).type;

  return element.hasAttribute('data-rr-is-password')
    ? 'password'
    : type
    ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      (type.toLowerCase() as Lowercase<string>)
    : null;
}

/** Start of Highlight Code
 * Returns a string of the same length that has been obfuscated.
 */
export function obfuscateText(text: string): string {
  // We remove non-printing characters.
  // For example: '&zwnj;' is a character that isn't shown visibly or takes up layout space on the screen. However if you take the length of the string, it's counted as 1.
  // For example: "&zwnj;1"'s length is 2 but visually it's only taking up 1 character width.
  // If we don't filter does out, our string obfuscation could have more characters than what was originally presented.
  text = text.replace(/[^ -~]+/g, '');
  text =
    text
      ?.split(' ')
      .map((word) => Math.random().toString(20).substr(2, word.length))
      .join(' ') || '';
  return text;
}

// returns true if the tag name is an element type that should have its source blocked
export function isElementSrcBlocked(tagName: string): boolean {
  return (
    tagName === 'img' ||
    tagName === 'video' ||
    tagName === 'audio' ||
    tagName === 'source'
  );
}

const EMAIL_REGEX = new RegExp(
  "[a-zA-Z0-9.!#$%&'*+=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:.[a-zA-Z0-9-]+)*",
);
const LONG_NUMBER_REGEX = new RegExp('d{9,16}'); // unformatted ssn, phone numbers, or credit card numbers
const SSN_REGEX = new RegExp('d{3}-?d{2}-?d{4}');
const PHONE_NUMBER_REGEX = new RegExp(
  '[+]?[(]?[0-9]{3}[)]?[-s.]?[0-9]{3}[-s.]?[0-9]{4,6}',
);
const CREDIT_CARD_REGEX = new RegExp('d{4}-?d{4}-?d{4}-?d{4}');
const ADDRESS_REGEX = new RegExp(
  'd{1,3}.?d{0,3}s[a-zA-Z]{2,30}s[a-zA-Z]{2,15}',
);
const IP_REGEX = new RegExp('(?:[0-9]{1,3}.){3}[0-9]{1,3}');

const DEFAULT_OBFUSCATE_REGEXES = [
  EMAIL_REGEX,
  LONG_NUMBER_REGEX,
  SSN_REGEX,
  PHONE_NUMBER_REGEX,
  CREDIT_CARD_REGEX,
  ADDRESS_REGEX,
  IP_REGEX,
];

export function shouldObfuscateTextByDefault(text: string | null): boolean {
  if (!text) return false;

  return DEFAULT_OBFUSCATE_REGEXES.some((regex) => regex.test(text));
}

export const maskedInputType = ({
  maskInputOptions,
  tagName,
  type,
  inputId,
  inputName,
  autocomplete,
}: {
  maskInputOptions: MaskInputOptions;
  tagName: string;
  type: string | null;
  inputId: string | null;
  inputName: string | null;
  autocomplete: boolean | string | null;
}): boolean => {
  const actualType = type && type.toLowerCase();

  return (
    maskInputOptions[tagName.toLowerCase() as keyof MaskInputOptions] ||
    (actualType && maskInputOptions[actualType as keyof MaskInputOptions]) ||
    (inputId && maskInputOptions[inputId as keyof MaskInputOptions]) ||
    (inputName && maskInputOptions[inputName as keyof MaskInputOptions]) ||
    (!!autocomplete && typeof autocomplete === 'string' && !!maskInputOptions[autocomplete as keyof MaskInputOptions])
  )
}

// overwritten from rrweb
export function maskInputValue({
  maskInputOptions,
  tagName,
  type,
  inputId,
  inputName,
  autocomplete,
  value,
  maskInputFn,
}: {
  maskInputOptions: MaskInputOptions;
  tagName: string;
  type: string | null;
  inputId: string | null;
  inputName: string | null;
  autocomplete: boolean | string | null;
  value: string | null;
  maskInputFn?: MaskInputFn;
}): string {
  let text = value || '';

  if (maskedInputType({maskInputOptions, tagName, type, inputId, inputName, autocomplete})) {
    if (maskInputFn) {
      text = maskInputFn(text);
    } else {
      text = '*'.repeat(text.length);
    }
  }
  return text;
}

/* End of Highlight Code */
