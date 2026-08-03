import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule } from 'lucide-angular';

import { auditActionLabelKey, type AuditListItem } from '../audit/audit.types';
import type { DueTodayLoan, OverdueLoan } from '../circulation/circulation.types';
import type { HoldListItem } from '../holds/holds.types';
import {
  type BarPoint,
  UiBadge,
  UiBarChart,
  UiCard,
  UiEmptyState,
  UiKpiCard,
  UiListItem,
  UiSkeleton,
} from '../ui';
import { OverviewStore } from './overview.store';
import { activityIcon, activityTone } from './overview.types';

@Component({
  selector: 'app-overview',
  providers: [OverviewStore, CurrencyPipe, DatePipe],
  imports: [
    LucideAngularModule,
    RouterLink,
    TranslocoPipe,
    UiBadge,
    UiBarChart,
    UiCard,
    UiEmptyState,
    UiKpiCard,
    UiListItem,
    UiSkeleton,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h2 class="text-[15px] font-bold text-ink-heading">
          {{ 'overview.title' | transloco }}
        </h2>
        <p class="mt-0.5 text-[12.5px] text-ink-muted">
          {{ 'overview.subtitle' | transloco }}
        </p>
      </div>

      @if (store.loading()) {
        <div role="status" aria-live="polite" class="flex flex-col gap-2.5">
          <span class="sr-only">{{ 'overview.loading' | transloco }}</span>
          <ui-skeleton [rows]="4" />
        </div>
      } @else {
        <!-- Quick actions: deep-link straight into the Circulation flows. -->
        <div class="grid gap-4 sm:grid-cols-2">
          <a
            routerLink="/circulation"
            class="flex items-center gap-4 rounded-card border border-line bg-surface p-6 transition-colors duration-100 hover:bg-row-hover focus-ring"
          >
            <span
              class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-badge-cyan-bg text-brand-dark"
            >
              <lucide-angular name="repeat" [size]="20" [strokeWidth]="1.75" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-bold text-ink-heading">
                {{ 'overview.quickActions.checkout' | transloco }}
              </span>
              <span class="block text-xs text-ink-muted">
                {{ 'overview.quickActions.checkoutHint' | transloco }}
              </span>
            </span>
          </a>
          <a
            [routerLink]="['/circulation']"
            [queryParams]="{ tab: 'checkin' }"
            class="flex items-center gap-4 rounded-card border border-line bg-surface p-6 transition-colors duration-100 hover:bg-row-hover focus-ring"
          >
            <span
              class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-badge-green-bg text-success"
            >
              <lucide-angular name="check-circle-2" [size]="20" [strokeWidth]="1.75" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-bold text-ink-heading">
                {{ 'overview.quickActions.checkin' | transloco }}
              </span>
              <span class="block text-xs text-ink-muted">
                {{ 'overview.quickActions.checkinHint' | transloco }}
              </span>
            </span>
          </a>
        </div>

        <!-- Decision stat cards. -->
        <div class="grid gap-4 sm:grid-cols-3">
          <ui-kpi-card
            [label]="'overview.stats.overdueCount' | transloco"
            [value]="store.overdueCount()"
            [hero]="true"
          />
          <ui-kpi-card
            [label]="'overview.stats.holdsWaiting' | transloco"
            [value]="store.holdsWaitingCount()"
          />
          <ui-kpi-card
            [label]="'overview.stats.finesOutstanding' | transloco"
            [value]="money(store.finesOutstanding())"
          />
        </div>

        <!-- Action lists: holds ready, due today, top overdue. -->
        <div class="grid gap-5 lg:grid-cols-3">
          <ui-card [title]="'overview.sections.holdsReady' | transloco">
            @if (store.holdsReadyError()) {
              <p role="alert" class="text-sm font-semibold text-danger">
                {{ 'overview.errors.holdsReady' | transloco }}
              </p>
            } @else if (store.holdsReady().length === 0) {
              <ui-empty-state
                [headline]="'overview.holdsReady.empty.headline' | transloco"
                [message]="'overview.holdsReady.empty.message' | transloco"
              />
            } @else {
              <div class="flex flex-col gap-4">
                @for (row of store.holdsReady(); track row.id) {
                  <ui-list-item
                    icon="check-circle-2"
                    iconTone="success"
                    [title]="row.title?.title ?? ''"
                    [meta]="holdsReadyMeta(row)"
                  />
                }
              </div>
            }
          </ui-card>

          <ui-card [title]="'overview.sections.dueToday' | transloco">
            @if (store.dueTodayError()) {
              <p role="alert" class="text-sm font-semibold text-danger">
                {{ 'overview.errors.dueToday' | transloco }}
              </p>
            } @else if (store.dueToday().length === 0) {
              <ui-empty-state
                [headline]="'overview.dueToday.empty.headline' | transloco"
                [message]="'overview.dueToday.empty.message' | transloco"
              />
            } @else {
              <div class="flex flex-col gap-4">
                @for (row of store.dueToday(); track row.loan_id) {
                  <ui-list-item
                    icon="clock"
                    iconTone="warning"
                    [title]="row.title ?? ''"
                    [meta]="dueTodayMeta(row)"
                  >
                    <span uiBadge tone="warning">{{ dueTodayTime(row) }}</span>
                  </ui-list-item>
                }
              </div>
            }
          </ui-card>

          <ui-card [title]="'overview.sections.topOverdue' | transloco">
            @if (store.topOverdueError()) {
              <p role="alert" class="text-sm font-semibold text-danger">
                {{ 'overview.errors.topOverdue' | transloco }}
              </p>
            } @else if (store.topOverdue().length === 0) {
              <ui-empty-state
                [headline]="'overview.topOverdue.empty.headline' | transloco"
                [message]="'overview.topOverdue.empty.message' | transloco"
              />
            } @else {
              <div class="flex flex-col gap-4">
                @for (row of store.topOverdue(); track row.loan_id) {
                  <ui-list-item
                    icon="alert-circle"
                    iconTone="danger"
                    [title]="row.title ?? ''"
                    [meta]="topOverdueMeta(row)"
                  >
                    <span uiBadge tone="danger">
                      {{ daysLateLabel(row) }} · {{ money(row.projected_fine) }}
                    </span>
                  </ui-list-item>
                }
              </div>
            }
          </ui-card>
        </div>

        <!-- Trend widget + recent-activity feed. -->
        <div class="grid gap-5 lg:grid-cols-2">
          <ui-card [title]="'overview.sections.trend' | transloco">
            @if (store.trendError()) {
              <p role="alert" class="text-sm font-semibold text-danger">
                {{ 'overview.errors.trend' | transloco }}
              </p>
            } @else {
              <ui-bar-chart
                [series]="trendSeries()"
                [chartLabel]="'overview.trend.chartLabel' | transloco"
                [categoryLabel]="'overview.trend.categoryLabel' | transloco"
                [seriesLabel]="'overview.trend.seriesLabel' | transloco"
              />
            }
          </ui-card>

          <ui-card [title]="'overview.sections.recentActivity' | transloco">
            @if (store.recentActivityError()) {
              <p role="alert" class="text-sm font-semibold text-danger">
                {{ 'overview.errors.recentActivity' | transloco }}
              </p>
            } @else if (store.recentActivity().length === 0) {
              <ui-empty-state
                [headline]="'overview.recentActivity.empty.headline' | transloco"
                [message]="'overview.recentActivity.empty.message' | transloco"
              />
            } @else {
              <div class="flex flex-col gap-4">
                @for (row of store.recentActivity(); track row.id) {
                  <ui-list-item
                    [icon]="activityIcon(row.entity_type)"
                    [iconTone]="activityTone(row.action)"
                    [title]="actionLabel(row.action)"
                    [meta]="activityMeta(row)"
                  />
                }
              </div>
            }
          </ui-card>
        </div>
      }
    </div>
  `,
})
export class Overview implements OnInit {
  protected readonly store = inject(OverviewStore);
  private readonly transloco = inject(TranslocoService);
  private readonly currencyPipe = inject(CurrencyPipe);
  private readonly datePipe = inject(DatePipe);

  protected readonly activityIcon = activityIcon;
  protected readonly activityTone = activityTone;

  protected readonly trendSeries = computed<BarPoint[]>(() =>
    this.store.trend().map((point) => ({
      label: point.day ? (this.datePipe.transform(point.day, 'EEE') ?? '') : '',
      value: point.checkouts ?? 0,
    })),
  );

  ngOnInit(): void {
    void this.store.init();
  }

  protected holdsReadyMeta(row: HoldListItem): string {
    return this.transloco.translate('overview.holdsReady.meta', {
      name: row.member?.name ?? '',
      barcode: row.copy?.barcode ?? '',
    });
  }

  protected dueTodayMeta(row: DueTodayLoan): string {
    return this.transloco.translate('overview.dueToday.meta', {
      name: row.member_name ?? '',
      barcode: row.copy_barcode ?? '',
    });
  }

  protected dueTodayTime(row: DueTodayLoan): string {
    return this.transloco.translate('overview.dueToday.due', {
      time: row.due_at ? (this.datePipe.transform(row.due_at, 'shortTime') ?? '') : '',
    });
  }

  protected topOverdueMeta(row: OverdueLoan): string {
    return this.transloco.translate('overview.topOverdue.meta', {
      name: row.member_name ?? '',
      barcode: row.copy_barcode ?? '',
    });
  }

  protected daysLateLabel(row: OverdueLoan): string {
    return this.transloco.translate('overview.topOverdue.daysLate', {
      days: row.days_late ?? 0,
    });
  }

  protected money(value: number | null): string {
    return this.currencyPipe.transform(value ?? 0, this.store.currency()) ?? '';
  }

  protected actionLabel(action: string): string {
    const key = auditActionLabelKey(action);
    const translated = this.transloco.translate(key);
    return translated === key ? action : translated;
  }

  protected actorName(row: AuditListItem): string {
    return row.actor_profile?.full_name ?? this.transloco.translate('audit.unknownActor');
  }

  protected activityMeta(row: AuditListItem): string {
    return this.transloco.translate('overview.recentActivity.meta', {
      actor: this.actorName(row),
      when: this.datePipe.transform(row.created_at, 'MMM d, HH:mm') ?? '',
    });
  }
}
