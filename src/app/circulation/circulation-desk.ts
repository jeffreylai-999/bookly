import { Component, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { SegmentedOption, UiSegmented } from '../ui';
import { CheckinPanel } from './checkin-panel';
import { Circulation } from './circulation';
import { LoansPanel } from './loans-panel';

type DeskTab = 'checkout' | 'checkin' | 'loans';

@Component({
  selector: 'app-circulation-desk',
  imports: [TranslocoPipe, UiSegmented, Circulation, CheckinPanel, LoansPanel],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-end gap-3">
        <ui-segmented
          [options]="tabOptions"
          [value]="tab()"
          (valueChange)="onTabChange($event)"
          [groupLabel]="'circulation.desk.tabsLabel' | transloco"
        />
      </div>

      <!-- Panels stay alive (hidden, not destroyed): an in-progress check-out
           queue or check-in preview must survive a tab round-trip. -->
      <div [hidden]="tab() !== 'checkout'">
        <app-circulation />
      </div>
      <div [hidden]="tab() !== 'checkin'">
        <app-checkin-panel />
      </div>
      <div [hidden]="tab() !== 'loans'">
        <app-loans-panel />
      </div>
    </div>
  `,
})
export class CirculationDesk {
  private readonly transloco = inject(TranslocoService);

  protected readonly tab = signal<DeskTab>('checkout');

  protected readonly tabOptions: SegmentedOption[] = (
    ['checkout', 'checkin', 'loans'] as const
  ).map((value) => ({
    value,
    label: this.transloco.translate(`circulation.desk.${value}`),
  }));

  protected onTabChange(value: string | undefined): void {
    if (value) this.tab.set(value as DeskTab);
  }
}
