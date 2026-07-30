import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';

import { UiEmptyState } from '../ui';

/** Shared stub for routes that exist for nav / guards before their feature slice. */
@Component({
  selector: 'app-coming-soon',
  imports: [TranslocoPipe, UiEmptyState],
  template: `
    <ui-empty-state
      [headline]="titleKey() | transloco"
      [message]="'shell.comingSoon' | transloco"
    />
  `,
})
export class ComingSoon {
  private readonly route = inject(ActivatedRoute);

  protected readonly titleKey = toSignal(
    this.route.data.pipe(map((data) => (data['titleKey'] as string) ?? 'app.brand')),
    { initialValue: 'app.brand' },
  );
}
