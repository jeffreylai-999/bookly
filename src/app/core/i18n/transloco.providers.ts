import { isDevMode, type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideTransloco, provideTranslocoMissingHandler } from '@jsverse/transloco';

import { LoudMissingKeyHandler } from './missing-key-handler';
import { TranslocoHttpLoader } from './transloco-loader';

/**
 * Deliberately does not call `provideHttpClient`. The app-wide HTTP client is
 * configured in `app.config.ts`: its backend providers are not `multi`, so a
 * second `provideHttpClient` elsewhere would silently win on a last-one-loaded
 * basis and drop any interceptors configured at the root.
 */
export function provideAppTransloco(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: ['en'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: {
          logMissingKey: false, // LoudMissingKeyHandler owns logging
          useFallbackTranslation: false,
        },
      },
      loader: TranslocoHttpLoader,
    }),
    provideTranslocoMissingHandler(LoudMissingKeyHandler),
  ]);
}
