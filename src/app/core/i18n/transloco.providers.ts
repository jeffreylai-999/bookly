import {
  isDevMode,
  type EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  provideTransloco,
  provideTranslocoMissingHandler,
} from '@jsverse/transloco';

import { LoudMissingKeyHandler } from './missing-key-handler';
import { TranslocoHttpLoader } from './transloco-loader';

export function provideAppTransloco(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withFetch()),
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
