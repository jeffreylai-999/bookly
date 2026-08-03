import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, inject, input } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';

/**
 * ECharts renders to canvas client-side only (design spec §2, §7) — the
 * server render must stay chart-free. Guards on `PLATFORM_ID` rather than
 * `afterNextRender` so the server-rendered markup is the placeholder itself,
 * not an empty host waiting for a callback that never runs on the server.
 *
 * The chart is `aria-hidden`: a canvas has no accessible text representation
 * of its data (WCAG 1.4.1, same rationale as `ui-bar-chart`), so every caller
 * renders its own visually-hidden data table alongside this component rather
 * than relying on `chartLabel` alone to carry the numbers.
 */
@Component({
  selector: 'ui-echart',
  imports: [NgxEchartsDirective],
  template: `
    @if (isBrowser) {
      <div
        echarts
        [options]="options()"
        [style.height]="height()"
        class="block w-full"
        role="img"
        [attr.aria-label]="chartLabel()"
      ></div>
    } @else {
      <div [style.height]="height()" class="rounded-[10px] bg-canvas" aria-hidden="true"></div>
    }
  `,
  host: { class: 'block' },
})
export class UiEcharts {
  private readonly platformId = inject(PLATFORM_ID);

  readonly options = input.required<EChartsCoreOption>();
  readonly chartLabel = input.required<string>();
  readonly height = input('280px');

  protected readonly isBrowser = isPlatformBrowser(this.platformId);
}
