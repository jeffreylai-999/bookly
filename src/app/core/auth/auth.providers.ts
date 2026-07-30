import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * After each successful navigation (except the first), move focus to the main
 * landmark so keyboard / screen-reader users aren't left on the previous page.
 * The first NavigationEnd is skipped so ui-layout's skip link stays the first
 * tab stop on initial load.
 */
export function provideRouteFocusManagement() {
  return provideAppInitializer(() => {
    const platformId = inject(PLATFORM_ID);
    if (!isPlatformBrowser(platformId)) {
      return;
    }

    const router = inject(Router);
    const document = inject(DOCUMENT);
    const destroyRef = inject(DestroyRef);
    const injector = inject(Injector);
    let skipNext = true;

    const sub = router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        if (skipNext) {
          skipNext = false;
          return;
        }
        afterNextRender(
          () => {
            document.getElementById('main-content')?.focus({ preventScroll: true });
          },
          { injector },
        );
      });

    destroyRef.onDestroy(() => sub.unsubscribe());
  });
}

/** Warm the cookie session before the first guarded navigation paints. */
export function provideAuthInitializer() {
  return provideAppInitializer(() => inject(AuthService).ensureReady());
}
