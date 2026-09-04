import { afterNextRender, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { inject as injectAnalytics } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

import { UiToastHost, type ToastType } from './ui';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TranslocoPipe, UiToastHost],
  templateUrl: './app.html',
})
export class App {
  private readonly transloco = inject(TranslocoService);

  constructor() {
    afterNextRender(() => {
      injectAnalytics();
      injectSpeedInsights();
    });
  }

  protected readonly toastTitles = computed<Record<ToastType, string>>(() => {
    const lang = this.transloco.activeLang();
    return {
      primary: this.transloco.translate('shell.toast.primary', undefined, lang),
      success: this.transloco.translate('shell.toast.success', undefined, lang),
      warning: this.transloco.translate('shell.toast.warning', undefined, lang),
      info: this.transloco.translate('shell.toast.info', undefined, lang),
      error: this.transloco.translate('shell.toast.error', undefined, lang),
    };
  });
}
