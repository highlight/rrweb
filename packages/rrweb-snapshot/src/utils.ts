import { INode, MaskInputFn, MaskInputOptions } from './types';

export function isElement(n: Node | INode): n is Element {
  return n.nodeType === n.ELEMENT_NODE;
}

export function isShadowRoot(n: Node): n is ShadowRoot {
  const host: Element | null = (n as ShadowRoot)?.host;
  return Boolean(host && host.shadowRoot && host.shadowRoot === n);
}

export function maskInputValue({
  maskInputOptions,
  tagName,
  type,
  value,
  maskInputFn,
}: {
  maskInputOptions: MaskInputOptions;
  tagName: string;
  type: string | number | boolean | null;
  value: string | null;
  maskInputFn?: MaskInputFn;
}): string {
  let text = value || '';
  if (
    maskInputOptions[tagName.toLowerCase() as keyof MaskInputOptions] ||
    maskInputOptions[type as keyof MaskInputOptions]
  ) {
    if (maskInputFn) {
      text = maskInputFn(text);
    } else {
      text = '*'.repeat(text.length);
    }
  }
  return text;
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

/** Start of Highlight
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
/* End of Highlight */
