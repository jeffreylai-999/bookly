import { Injectable } from '@angular/core';
import type { TranslocoMissingHandler, TranslocoMissingHandlerData } from '@jsverse/transloco';

function missingKeyMessage(key: string, data: TranslocoMissingHandlerData): string {
  return `[Transloco] Missing translation key: "${key}" (lang: ${data.activeLang})`;
}

/**
 * Ships with the app: logs a missing key outside production and renders the key
 * itself, so a gap in the catalog is visible without taking the page down.
 */
@Injectable()
export class LoudMissingKeyHandler implements TranslocoMissingHandler {
  handle(
    key: string,
    data: TranslocoMissingHandlerData,
    _params?: Record<string, unknown>,
  ): string {
    // `prodMode` comes from the Transloco config, which derives it from
    // `isDevMode()`. Trust the config rather than re-reading the global.
    if (!data.prodMode) {
      console.error(missingKeyMessage(key, data));
    }

    return key;
  }
}

/**
 * Test-only: turns a missing key into a failure. Specs opt in with
 * `provideTranslocoMissingHandler(ThrowingMissingKeyHandler)`.
 *
 * A separate class rather than a branch inside `LoudMissingKeyHandler`, which
 * used to decide by sniffing `process.env.VITEST` — test-runner detection
 * compiled into the browser and server bundles, silently dead if the runner
 * ever changed. Opting in per spec is no weaker than that was: any spec that
 * did not provide the handler got Transloco's `DefaultMissingHandler` and never
 * threw, env var or not.
 *
 * A global `providersFile` cannot replace the opt-in: `TranslocoTestingModule`
 * calls `provideTransloco`, which provides `TRANSLOCO_MISSING_HANDLER` itself,
 * and module providers from `imports` outrank the base test providers.
 */
@Injectable()
export class ThrowingMissingKeyHandler implements TranslocoMissingHandler {
  handle(
    key: string,
    data: TranslocoMissingHandlerData,
    _params?: Record<string, unknown>,
  ): string {
    throw new Error(missingKeyMessage(key, data));
  }
}
