import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';

/**
 * Registers the ngx-echarts directive's ECharts instance app-wide, via an
 * async loader (`ngx-echarts` supports `echarts: () => Promise<any>`
 * specifically for this) so the library itself only downloads inside
 * Reports' lazy route chunk, never the initial bundle.
 */
export function provideAppEcharts(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideEchartsCore({ echarts: () => import('./echarts-setup').then((m) => m.echarts) }),
  ]);
}
