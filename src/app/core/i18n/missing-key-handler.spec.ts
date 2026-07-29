import { LoudMissingKeyHandler } from './missing-key-handler';
import type { TranslocoMissingHandlerData } from '@jsverse/transloco';

describe('LoudMissingKeyHandler', () => {
  const handler = new LoudMissingKeyHandler();
  const data = {
    activeLang: 'en',
    defaultLang: 'en',
    availableLangs: ['en'],
    prodMode: false,
  } as TranslocoMissingHandlerData;

  it('throws under Vitest so missing keys fail tests', () => {
    expect(() => handler.handle('missing.key', data)).toThrowError(
      /Missing translation key: "missing\.key"/,
    );
  });
});
