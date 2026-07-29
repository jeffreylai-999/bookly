import { Injectable, isDevMode } from '@angular/core';
import type {
  TranslocoMissingHandler,
  TranslocoMissingHandlerData,
} from '@jsverse/transloco';

/**
 * Loud missing-key handler: console.error in development; throws under Vitest
 * so component tests fail when a key is absent from the `en` catalog.
 */
@Injectable()
export class LoudMissingKeyHandler implements TranslocoMissingHandler {
  handle(
    key: string,
    data: TranslocoMissingHandlerData,
    _params?: Record<string, unknown>,
  ): string {
    const message = `[Transloco] Missing translation key: "${key}" (lang: ${data.activeLang})`;

    if (isRunningVitest()) {
      throw new Error(message);
    }

    if (isDevMode() || !data.prodMode) {
      console.error(message);
    }

    return key;
  }
}

function isRunningVitest(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.['VITEST'] === 'true';
}
