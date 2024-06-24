import type { serializedNodeWithId } from '@rrweb/types';

export type tagMap = {
  [key: string]: string;
};

export type DialogAttributes = {
  open: string;
  /**
   * Represents the dialog's open mode.
   * `modal` means the dialog is opened with `showModal()`.
   * `non-modal` means the dialog is opened with `show()` or
   * by adding an `open` attribute.
   */
  rr_open_mode: 'modal' | 'non-modal';
  /**
   * Currently unimplemented, but in future can be used to:
   * Represents the order of which of the dialog was opened.
   * This is useful for replaying the dialog `.showModal()` in the correct order.
   */
  // rr_open_mode_index?: number;
};

export interface ICanvas extends HTMLCanvasElement {
  __context: string;
}

export type idNodeMap = Map<number, Node>;

export type nodeMetaMap = WeakMap<Node, serializedNodeWithId>;

// Highlight: added additonal fields to obfuscate
export type MaskInputOptions = Partial<{
  color: boolean;
  date: boolean;
  'datetime-local': boolean;
  email: boolean;
  month: boolean;
  number: boolean;
  range: boolean;
  search: boolean;
  tel: boolean;
  text: boolean;
  time: boolean;
  url: boolean;
  week: boolean;
  // unify textarea and select element with text input
  textarea: boolean;
  select: boolean;
  password: boolean;
  // Highlight: added additonal fields to obfuscate
  name: boolean;
  'given-name': boolean;
  'family-name': boolean;
  'additional-name': boolean;
  'one-time-code': boolean;
  'street-address': boolean;
  address: boolean;
  'address-line1': boolean;
  'address-line2': boolean;
  'address-line3': boolean;
  'address-level4': boolean;
  'address-level3': boolean;
  'address-level2': boolean;
  'address-level1': boolean;
  city: boolean;
  state: boolean;
  country: boolean;
  zip: boolean;
  'country-name': boolean;
  'postal-code': boolean;
  'cc-name': boolean;
  'cc-given-name': boolean;
  'cc-additional-name': boolean;
  'cc-family-name': boolean;
  'cc-number': boolean;
  'cc-exp': boolean;
  'cc-exp-month': boolean;
  'cc-exp-year': boolean;
  'cc-csc': boolean;
  'cc-type': boolean;
  bday: boolean;
  'bday-day': boolean;
  'bday-month': boolean;
  'bday-year': boolean;
  sex: boolean;
  'tel-country-code': boolean;
  'tel-national': boolean;
  'tel-area-code': boolean;
  'tel-local': boolean;
  'tel-extension': boolean;
  ssn: boolean;
}>;

export type SlimDOMOptions = Partial<{
  script: boolean;
  comment: boolean;
  headFavicon: boolean;
  headWhitespace: boolean;
  headMetaDescKeywords: boolean;
  headMetaSocial: boolean;
  headMetaRobots: boolean;
  headMetaHttpEquiv: boolean;
  headMetaAuthorship: boolean;
  headMetaVerification: boolean;
  /**
   * blocks title tag 'animations' which can generate a lot of mutations that aren't usually displayed in replayers
   **/
  headTitleMutations: boolean;
}>;

export type MaskTextFn = (text: string, element: HTMLElement | null) => string;
export type MaskInputFn = (text: string, element: HTMLElement) => string;

export type KeepIframeSrcFn = (src: string) => boolean;

export type BuildCache = {
  stylesWithHoverClass: Map<string, string>;
};

export type PrivacySettingOption = 'strict' | 'default' | 'none';
