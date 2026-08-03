import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { EChartsCoreOption } from 'echarts/core';

import {
  SegmentedOption,
  TableColumn,
  ToastService,
  UiBtn,
  UiCard,
  UiEcharts,
  UiEmptyState,
  UiSegmented,
  UiTable,
} from '../ui';
import { downloadCsv, toCsv } from './csv';
import { ReportsStore } from './reports.store';
import {
  RANGE_DAYS_OPTIONS,
  type DeadStockRow,
  type HighDemandRow,
  type RangeDays,
} from './reports.types';

/** Chart palette (design tokens `--color-chart-*` in src/styles.css). */
const CHART_TEAL = '#039db7';
const CHART_CYAN = '#45bbce';
const CHART_AMBER = '#f0b94a';
const CHART_PURPLE = '#7c59d3';
const CHART_DANGER = '#be2539';
const GENRE_PALETTE = [CHART_TEAL, CHART_CYAN, CHART_AMBER, CHART_PURPLE, CHART_DANGER];

const AGING_BUCKET_KEYS: Record<string, string> = {
  '1-7': 'oneToSeven',
  '8-14': 'eightToFourteen',
  '15-30': 'fifteenToThirty',
  '30+': 'thirtyPlus',
};

@Component({
  selector: 'app-reports',
  providers: [ReportsStore, DatePipe],
  imports: [
    CurrencyPipe,
    DatePipe,
    TranslocoPipe,
    UiBtn,
    UiCard,
    UiEcharts,
    UiEmptyState,
    UiSegmented,
    UiTable,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-[15px] font-bold text-ink-heading">
            {{ 'reports.title' | transloco }}
          </h2>
          <p class="mt-0.5 text-[12.5px] text-ink-muted">{{ subtitle() }}</p>
        </div>
        <ui-segmented
          [options]="rangeOptions"
          [value]="String(store.range())"
          (valueChange)="onRangeChange($event)"
          [groupLabel]="'reports.rangeLabel' | transloco"
        />
      </div>

      @if (store.error()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'reports.errors.loadFailed' | transloco }}
        </p>
      }

      <!-- Overdue aging: present-state snapshot, not range-scoped (spec §7). -->
      <ui-card
        [title]="'reports.overdueAging.title' | transloco"
        [subtitle]="'reports.overdueAging.subtitle' | transloco"
      >
        <button
          card-actions
          uiBtn
          variant="pill-muted"
          type="button"
          (click)="exportOverdueAging()"
        >
          {{ 'reports.export' | transloco }}
        </button>
        <ui-echart
          [options]="overdueAgingChart()"
          [chartLabel]="'reports.overdueAging.title' | transloco"
        />
        <table class="sr-only">
          <caption>
            {{
              'reports.overdueAging.title' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'reports.overdueAging.columns.bucket' | transloco }}</th>
              <th scope="col">{{ 'reports.overdueAging.columns.count' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of store.overdueAging(); track row.bucket) {
              <tr>
                <th scope="row">{{ agingBucketLabel(row.bucket) }}</th>
                <td>{{ row.loan_count }}</td>
              </tr>
            }
          </tbody>
        </table>
      </ui-card>

      <!-- Dead stock: a ranked title list reads better as a table than a chart. -->
      <ui-card
        [title]="'reports.deadStock.title' | transloco"
        [subtitle]="rangeSubtitle('reports.deadStock.subtitle')"
      >
        <button card-actions uiBtn variant="pill-muted" type="button" (click)="exportDeadStock()">
          {{ 'reports.export' | transloco }}
        </button>
        <ui-table
          [columns]="deadStockColumns"
          [rows]="store.deadStock()"
          [caption]="'reports.deadStock.title' | transloco"
          [rowKey]="rowId"
        >
          <ui-empty-state
            [headline]="'reports.deadStock.empty.headline' | transloco"
            [message]="'reports.deadStock.empty.message' | transloco"
          />
        </ui-table>
      </ui-card>

      <!-- High demand: same table rationale as dead stock. -->
      <ui-card
        [title]="'reports.highDemand.title' | transloco"
        [subtitle]="rangeSubtitle('reports.highDemand.subtitle')"
      >
        <button card-actions uiBtn variant="pill-muted" type="button" (click)="exportHighDemand()">
          {{ 'reports.export' | transloco }}
        </button>
        <ui-table
          [columns]="highDemandColumns"
          [rows]="store.highDemand()"
          [caption]="'reports.highDemand.title' | transloco"
          [rowKey]="rowId"
        >
          <ui-empty-state
            [headline]="'reports.highDemand.empty.headline' | transloco"
            [message]="'reports.highDemand.empty.message' | transloco"
          />
        </ui-table>
      </ui-card>

      <!-- Fine collection: collected vs incurred, per day. -->
      <ui-card
        [title]="'reports.fineCollection.title' | transloco"
        [subtitle]="rangeSubtitle('reports.fineCollection.subtitle')"
      >
        <button
          card-actions
          uiBtn
          variant="pill-muted"
          type="button"
          (click)="exportFineCollection()"
        >
          {{ 'reports.export' | transloco }}
        </button>
        <ui-echart
          [options]="fineCollectionChart()"
          [chartLabel]="'reports.fineCollection.title' | transloco"
        />
        <table class="sr-only">
          <caption>
            {{
              'reports.fineCollection.title' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'reports.fineCollection.columns.date' | transloco }}</th>
              <th scope="col">{{ 'reports.fineCollection.columns.collected' | transloco }}</th>
              <th scope="col">{{ 'reports.fineCollection.columns.incurred' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of store.fineCollection(); track row.report_date) {
              <tr>
                <th scope="row">{{ row.report_date | date: 'mediumDate' }}</th>
                <td>{{ row.collected | currency: store.currency() }}</td>
                <td>{{ row.incurred | currency: store.currency() }}</td>
              </tr>
            }
          </tbody>
        </table>
      </ui-card>

      <!-- New member growth. -->
      <ui-card
        [title]="'reports.newMemberGrowth.title' | transloco"
        [subtitle]="rangeSubtitle('reports.newMemberGrowth.subtitle')"
      >
        <button
          card-actions
          uiBtn
          variant="pill-muted"
          type="button"
          (click)="exportNewMemberGrowth()"
        >
          {{ 'reports.export' | transloco }}
        </button>
        <ui-echart
          [options]="newMemberGrowthChart()"
          [chartLabel]="'reports.newMemberGrowth.title' | transloco"
        />
        <table class="sr-only">
          <caption>
            {{
              'reports.newMemberGrowth.title' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'reports.newMemberGrowth.columns.date' | transloco }}</th>
              <th scope="col">{{ 'reports.newMemberGrowth.columns.count' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of store.newMemberGrowth(); track row.report_date) {
              <tr>
                <th scope="row">{{ row.report_date | date: 'mediumDate' }}</th>
                <td>{{ row.member_count }}</td>
              </tr>
            }
          </tbody>
        </table>
      </ui-card>

      <!-- Peak hours: check-out-hour histogram, library timezone. -->
      <ui-card
        [title]="'reports.peakHours.title' | transloco"
        [subtitle]="rangeSubtitle('reports.peakHours.subtitle')"
      >
        <button card-actions uiBtn variant="pill-muted" type="button" (click)="exportPeakHours()">
          {{ 'reports.export' | transloco }}
        </button>
        <ui-echart
          [options]="peakHoursChart()"
          [chartLabel]="'reports.peakHours.title' | transloco"
        />
        <table class="sr-only">
          <caption>
            {{
              'reports.peakHours.title' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'reports.peakHours.columns.hour' | transloco }}</th>
              <th scope="col">{{ 'reports.peakHours.columns.count' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of store.peakHours(); track row.hour_of_day) {
              <tr>
                <th scope="row">{{ hourLabel(row.hour_of_day) }}</th>
                <td>{{ row.checkout_count }}</td>
              </tr>
            }
          </tbody>
        </table>
      </ui-card>

      <!-- Genre breakdown. -->
      <ui-card
        [title]="'reports.genreBreakdown.title' | transloco"
        [subtitle]="rangeSubtitle('reports.genreBreakdown.subtitle')"
      >
        <button
          card-actions
          uiBtn
          variant="pill-muted"
          type="button"
          (click)="exportGenreBreakdown()"
        >
          {{ 'reports.export' | transloco }}
        </button>
        <ui-echart
          [options]="genreBreakdownChart()"
          [chartLabel]="'reports.genreBreakdown.title' | transloco"
        />
        <table class="sr-only">
          <caption>
            {{
              'reports.genreBreakdown.title' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'reports.genreBreakdown.columns.genre' | transloco }}</th>
              <th scope="col">{{ 'reports.genreBreakdown.columns.count' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of store.genreBreakdown(); track row.genre) {
              <tr>
                <th scope="row">{{ row.genre }}</th>
                <td>{{ row.checkout_count }}</td>
              </tr>
            }
          </tbody>
        </table>
      </ui-card>
    </div>
  `,
})
export class Reports implements OnInit {
  protected readonly store = inject(ReportsStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly datePipe = inject(DatePipe);

  protected readonly String = String;
  protected readonly rowId = (row: DeadStockRow | HighDemandRow) => row.title_id;

  protected readonly rangeOptions: SegmentedOption[] = RANGE_DAYS_OPTIONS.map((days) => ({
    value: String(days),
    label: this.transloco.translate('reports.rangeOption', { days }),
  }));

  protected readonly deadStockColumns: TableColumn<DeadStockRow>[] = [
    { key: 'title', header: this.transloco.translate('reports.deadStock.columns.title') },
    { key: 'author', header: this.transloco.translate('reports.deadStock.columns.author') },
    { key: 'genre', header: this.transloco.translate('reports.deadStock.columns.genre') },
    {
      key: 'lendable_copies',
      header: this.transloco.translate('reports.deadStock.columns.copies'),
      align: 'right',
    },
  ];

  protected readonly highDemandColumns: TableColumn<HighDemandRow>[] = [
    { key: 'title', header: this.transloco.translate('reports.highDemand.columns.title') },
    { key: 'author', header: this.transloco.translate('reports.highDemand.columns.author') },
    {
      key: 'checkout_count',
      header: this.transloco.translate('reports.highDemand.columns.checkouts'),
      align: 'right',
    },
    {
      key: 'waiting_holds',
      header: this.transloco.translate('reports.highDemand.columns.waitingHolds'),
      align: 'right',
    },
  ];

  /** Today's date range boundaries for the header subtitle (library-local
   * bucketing happens server-side; this is just the human-readable label). */
  private readonly rangeStart = computed(() => {
    const start = new Date();
    start.setDate(start.getDate() - (this.store.range() - 1));
    return start;
  });
  private readonly today = new Date();

  protected readonly subtitle = computed(() =>
    this.transloco.translate('reports.subtitle', {
      from: this.datePipe.transform(this.rangeStart(), 'mediumDate'),
      to: this.datePipe.transform(this.today, 'mediumDate'),
    }),
  );

  protected readonly overdueAgingChart = computed<EChartsCoreOption>(() => {
    const rows = this.store.overdueAging();
    return {
      tooltip: {},
      grid: { left: 40, right: 16, top: 16, bottom: 32 },
      xAxis: { type: 'category', data: rows.map((r) => this.agingBucketLabel(r.bucket)) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => r.loan_count),
          itemStyle: { color: CHART_DANGER },
        },
      ],
    };
  });

  protected readonly fineCollectionChart = computed<EChartsCoreOption>(() => {
    const rows = this.store.fineCollection();
    const dates = rows.map((r) => this.datePipe.transform(r.report_date, 'M/d') ?? r.report_date);
    return {
      tooltip: { trigger: 'axis' },
      legend: {
        data: [
          this.transloco.translate('reports.fineCollection.columns.collected'),
          this.transloco.translate('reports.fineCollection.columns.incurred'),
        ],
        bottom: 0,
      },
      grid: { left: 48, right: 16, top: 16, bottom: 48 },
      xAxis: { type: 'category', data: dates },
      yAxis: { type: 'value' },
      series: [
        {
          name: this.transloco.translate('reports.fineCollection.columns.collected'),
          type: 'line',
          data: rows.map((r) => r.collected),
          color: CHART_TEAL,
        },
        {
          name: this.transloco.translate('reports.fineCollection.columns.incurred'),
          type: 'line',
          data: rows.map((r) => r.incurred),
          color: CHART_AMBER,
        },
      ],
    };
  });

  protected readonly newMemberGrowthChart = computed<EChartsCoreOption>(() => {
    const rows = this.store.newMemberGrowth();
    const dates = rows.map((r) => this.datePipe.transform(r.report_date, 'M/d') ?? r.report_date);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 16, top: 16, bottom: 32 },
      xAxis: { type: 'category', data: dates },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => r.member_count),
          itemStyle: { color: CHART_CYAN },
        },
      ],
    };
  });

  protected readonly peakHoursChart = computed<EChartsCoreOption>(() => {
    const rows = this.store.peakHours();
    return {
      tooltip: {},
      grid: { left: 40, right: 16, top: 16, bottom: 32 },
      xAxis: { type: 'category', data: rows.map((r) => this.hourLabel(r.hour_of_day)) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => r.checkout_count),
          itemStyle: { color: CHART_PURPLE },
        },
      ],
    };
  });

  protected readonly genreBreakdownChart = computed<EChartsCoreOption>(() => {
    const rows = this.store.genreBreakdown();
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      color: GENRE_PALETTE,
      series: [
        {
          type: 'pie',
          radius: '65%',
          data: rows.map((r) => ({ name: r.genre, value: r.checkout_count })),
        },
      ],
    };
  });

  ngOnInit(): void {
    void this.store.init().then(() => this.toastOnError());
  }

  protected agingBucketLabel(bucket: string): string {
    const key = AGING_BUCKET_KEYS[bucket];
    return key ? this.transloco.translate(`reports.overdueAging.buckets.${key}`) : bucket;
  }

  protected hourLabel(hour: number): string {
    return this.transloco.translate('reports.peakHours.hourLabel', {
      hour: String(hour).padStart(2, '0'),
    });
  }

  protected rangeSubtitle(key: string): string {
    return this.transloco.translate(key, { days: this.store.range() });
  }

  protected async onRangeChange(value: string | undefined): Promise<void> {
    if (!value) return;
    await this.store.setRange(Number(value) as RangeDays);
    this.toastOnError();
  }

  protected exportOverdueAging(): void {
    const rows = this.store.overdueAging();
    const csv = toCsv(
      [
        this.transloco.translate('reports.overdueAging.columns.bucket'),
        this.transloco.translate('reports.overdueAging.columns.count'),
      ],
      rows.map((r) => [this.agingBucketLabel(r.bucket), r.loan_count]),
    );
    downloadCsv('overdue-aging.csv', csv);
  }

  protected exportDeadStock(): void {
    const rows = this.store.deadStock();
    const csv = toCsv(
      this.deadStockColumns.map((c) => c.header),
      rows.map((r) => [r.title, r.author, r.genre, r.lendable_copies]),
    );
    downloadCsv(`dead-stock-${this.store.range()}-days.csv`, csv);
  }

  protected exportHighDemand(): void {
    const rows = this.store.highDemand();
    const csv = toCsv(
      this.highDemandColumns.map((c) => c.header),
      rows.map((r) => [r.title, r.author, r.checkout_count, r.waiting_holds]),
    );
    downloadCsv(`high-demand-${this.store.range()}-days.csv`, csv);
  }

  protected exportFineCollection(): void {
    const rows = this.store.fineCollection();
    const csv = toCsv(
      [
        this.transloco.translate('reports.fineCollection.columns.date'),
        this.transloco.translate('reports.fineCollection.columns.collected'),
        this.transloco.translate('reports.fineCollection.columns.incurred'),
      ],
      rows.map((r) => [r.report_date, r.collected, r.incurred]),
    );
    downloadCsv(`fine-collection-${this.store.range()}-days.csv`, csv);
  }

  protected exportNewMemberGrowth(): void {
    const rows = this.store.newMemberGrowth();
    const csv = toCsv(
      [
        this.transloco.translate('reports.newMemberGrowth.columns.date'),
        this.transloco.translate('reports.newMemberGrowth.columns.count'),
      ],
      rows.map((r) => [r.report_date, r.member_count]),
    );
    downloadCsv(`new-member-growth-${this.store.range()}-days.csv`, csv);
  }

  protected exportPeakHours(): void {
    const rows = this.store.peakHours();
    const csv = toCsv(
      [
        this.transloco.translate('reports.peakHours.columns.hour'),
        this.transloco.translate('reports.peakHours.columns.count'),
      ],
      rows.map((r) => [this.hourLabel(r.hour_of_day), r.checkout_count]),
    );
    downloadCsv(`peak-hours-${this.store.range()}-days.csv`, csv);
  }

  protected exportGenreBreakdown(): void {
    const rows = this.store.genreBreakdown();
    const csv = toCsv(
      [
        this.transloco.translate('reports.genreBreakdown.columns.genre'),
        this.transloco.translate('reports.genreBreakdown.columns.count'),
      ],
      rows.map((r) => [r.genre, r.checkout_count]),
    );
    downloadCsv(`genre-breakdown-${this.store.range()}-days.csv`, csv);
  }

  private toastOnError(): void {
    if (this.store.error()) {
      this.toast.error(this.transloco.translate('reports.errors.loadFailed'));
    }
  }
}
