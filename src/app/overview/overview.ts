import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { UiEmptyState } from '../ui';

@Component({
  selector: 'app-overview',
  imports: [TranslocoPipe, UiEmptyState],
  template: `
    <ui-empty-state
      [headline]="'overview.empty.headline' | transloco"
      [message]="'overview.empty.message' | transloco"
    />
  `,
})
export class Overview {}
