import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

/**
 * A curated `echarts/core` build (Reports' four chart shapes + the shared
 * chrome) instead of the full `echarts` bundle, which pulls in map/3D/graph
 * renderers this app never uses. Kept in its own module — never imported
 * statically from `app.config.ts` — so `provideAppEcharts`'s async loader
 * (below) puts the whole ~150kB library in Reports' lazy chunk instead of
 * the initial bundle (design spec §2: ECharts is Reports-only).
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export { echarts };
