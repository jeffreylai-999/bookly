import { LoudMissingKeyHandler, ThrowingMissingKeyHandler } from './missing-key-handler';
import type { TranslocoMissingHandlerData } from '@jsverse/transloco';
import { vi } from 'vitest';

const dataWith = (prodMode: boolean) =>
  ({
    activeLang: 'en',
    defaultLang: 'en',
    availableLangs: ['en'],
    prodMode,
  }) as TranslocoMissingHandlerData;

describe('ThrowingMissingKeyHandler', () => {
  it('turns a missing key into a failure, naming the key and the language', () => {
    expect(() =>
      new ThrowingMissingKeyHandler().handle('missing.key', dataWith(false)),
    ).toThrowError(/Missing translation key: "missing\.key" \(lang: en\)/);
  });
});

describe('LoudMissingKeyHandler', () => {
  it('logs outside production and renders the key so the page survives', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const rendered = new LoudMissingKeyHandler().handle('missing.key', dataWith(false));

    expect(rendered).toBe('missing.key');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('Missing translation key: "missing.key"');
    spy.mockRestore();
  });

  it('stays silent in production, where a console error helps nobody', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const rendered = new LoudMissingKeyHandler().handle('missing.key', dataWith(true));

    expect(rendered).toBe('missing.key');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('never throws — failing the test is the other handler responsibility', () => {
    expect(() => new LoudMissingKeyHandler().handle('missing.key', dataWith(false))).not.toThrow();
  });
});
