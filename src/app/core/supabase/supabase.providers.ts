import { isPlatformBrowser } from '@angular/common';
import {
  InjectionToken,
  PLATFORM_ID,
  inject,
  type EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { createSupabaseBrowserClient } from './browser-client';
import type { AppSupabaseClient } from './client.types';
import { createSupabaseServerClient } from './server-client';

export const SUPABASE_CLIENT = new InjectionToken<AppSupabaseClient>('SUPABASE_CLIENT');

export function provideSupabaseClient(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: SUPABASE_CLIENT,
      useFactory: (): AppSupabaseClient => {
        const platformId = inject(PLATFORM_ID);
        return isPlatformBrowser(platformId)
          ? createSupabaseBrowserClient()
          : createSupabaseServerClient();
      },
    },
  ]);
}
