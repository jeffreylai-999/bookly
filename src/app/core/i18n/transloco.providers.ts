import { isDevMode, inject, provideAppInitializer, type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideTransloco, provideTranslocoMissingHandler, TranslocoService } from '@jsverse/transloco';

import en from '../../../../public/i18n/en.json';
import { LoudMissingKeyHandler } from './missing-key-handler';
import { TranslocoHttpLoader } from './transloco-loader';

/**
 * Deliberately does not call `provideHttpClient`. The app-wide HTTP client is
 * configured in `app.config.ts`: its backend providers are not `multi`, so a
 * second `provideHttpClient` elsewhere would silently win on a last-one-loaded
 * basis and drop any interceptors configured at the root.
 *
 * English is seeded in an app initializer. `translate()` does not wait for the
 * HTTP loader; without a seed, SSR and the first client paint log every key
 * that a `computed` looks up (nav.members, members.status.*, the bell label).
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
    provideAppInitializer(() => {
      inject(TranslocoService).setTranslation(en, 'en');
    }),
  ]);
}
