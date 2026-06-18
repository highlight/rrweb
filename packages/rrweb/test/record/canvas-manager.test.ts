import type { IWindow } from '@rrweb/types';
import { describe, expect, it } from 'vitest';
import { CanvasManager } from '../../src/record/observers/canvas/canvas-manager';

const shouldUseManualBitmapResize = (
  userAgent: string,
  vendor = '',
  platform = '',
  maxTouchPoints = 0,
) =>
  (
    CanvasManager as unknown as {
      shouldUseManualBitmapResize: (win: IWindow) => boolean;
    }
  ).shouldUseManualBitmapResize({
    navigator: {
      userAgent,
      vendor,
      platform,
      maxTouchPoints,
    },
  } as unknown as IWindow);

describe('CanvasManager snapshot bitmap resize selection', () => {
  it('uses manual bitmap resize for desktop Safari', () => {
    expect(
      shouldUseManualBitmapResize(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
        'Apple Computer, Inc.',
        'MacIntel',
      ),
    ).toBe(true);
  });

  it('uses manual bitmap resize for iOS WebKit browsers', () => {
    expect(
      shouldUseManualBitmapResize(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1',
        'Google Inc.',
        'iPhone',
      ),
    ).toBe(true);
  });

  it('uses manual bitmap resize for iPadOS desktop-style user agents', () => {
    expect(
      shouldUseManualBitmapResize(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
        'Apple Computer, Inc.',
        'MacIntel',
        5,
      ),
    ).toBe(true);
  });

  it('keeps Chromium and Firefox on the standard bitmap resize path', () => {
    expect(
      shouldUseManualBitmapResize(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Google Inc.',
        'MacIntel',
      ),
    ).toBe(false);

    expect(
      shouldUseManualBitmapResize(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13.4; rv:124.0) Gecko/20100101 Firefox/124.0',
        '',
        'MacIntel',
      ),
    ).toBe(false);
  });
});
