import { Service, inject, signal } from '@angular/core';

import type { AuditListItem } from '../audit/audit.types';
import { AuditRepository } from '../audit/audit.repository';
import { AppSettingsService } from '../core/app-settings';
import { CirculationRepository } from '../circulation/circulation.repository';
import type {
  CheckoutTrendPoint,
  DueTodayLoan,
  OverdueLoan,
} from '../circulation/circulation.types';
import { FinesRepository } from '../fines/fines.repository';
import { HoldsRepository } from '../holds/holds.repository';
import type { HoldListItem } from '../holds/holds.types';
import {
  DUE_TODAY_LIMIT,
  HOLDS_READY_LIMIT,
  RECENT_ACTIVITY_LIMIT,
  TOP_OVERDUE_LIMIT,
} from './overview.types';

/**
 * Composes reads across the aggregates each own repository already serves
 * (holds, loans/overdue, fines, audit) rather than owning a query of its
 * own — Overview is a launchpad, not a new aggregate. Every section tracks
 * its own error so one failed widget never blanks the rest of the briefing.
 */
@Service()
export class OverviewStore {
  private readonly circulationRepo = inject(CirculationRepository);
  private readonly holdsRepo = inject(HoldsRepository);
  private readonly finesRepo = inject(FinesRepository);
  private readonly auditRepo = inject(AuditRepository);
  private readonly appSettings = inject(AppSettingsService);

  private readonly loadingState = signal(false);

  private readonly holdsReadyState = signal<HoldListItem[]>([]);
  private readonly holdsReadyErrorState = signal<string | null>(null);

  private readonly dueTodayState = signal<DueTodayLoan[]>([]);
  private readonly dueTodayErrorState = signal<string | null>(null);

  private readonly topOverdueState = signal<OverdueLoan[]>([]);
  private readonly topOverdueErrorState = signal<string | null>(null);
  private readonly overdueCountState = signal(0);

  private readonly holdsWaitingCountState = signal(0);
  private readonly holdsWaitingCountErrorState = signal<string | null>(null);

  private readonly finesOutstandingState = signal(0);
  private readonly finesSummaryErrorState = signal<string | null>(null);

  private readonly recentActivityState = signal<AuditListItem[]>([]);
  private readonly recentActivityErrorState = signal<string | null>(null);

  private readonly trendState = signal<CheckoutTrendPoint[]>([]);
  private readonly trendErrorState = signal<string | null>(null);

  readonly loading = this.loadingState.asReadonly();

  readonly holdsReady = this.holdsReadyState.asReadonly();
  readonly holdsReadyError = this.holdsReadyErrorState.asReadonly();

  readonly dueToday = this.dueTodayState.asReadonly();
  readonly dueTodayError = this.dueTodayErrorState.asReadonly();

  readonly topOverdue = this.topOverdueState.asReadonly();
  readonly topOverdueError = this.topOverdueErrorState.asReadonly();
  readonly overdueCount = this.overdueCountState.asReadonly();

  readonly holdsWaitingCount = this.holdsWaitingCountState.asReadonly();
  readonly holdsWaitingCountError = this.holdsWaitingCountErrorState.asReadonly();

  readonly finesOutstanding = this.finesOutstandingState.asReadonly();
  readonly finesSummaryError = this.finesSummaryErrorState.asReadonly();
  readonly currency = this.appSettings.currency;

  readonly recentActivity = this.recentActivityState.asReadonly();
  readonly recentActivityError = this.recentActivityErrorState.asReadonly();

  readonly trend = this.trendState.asReadonly();
  readonly trendError = this.trendErrorState.asReadonly();

  async init(): Promise<void> {
    this.loadingState.set(true);
    try {
      await Promise.all([
        this.appSettings.load(),
        this.loadHoldsReady(),
        this.loadDueToday(),
        this.loadTopOverdue(),
        this.loadHoldsWaitingCount(),
        this.loadFinesSummary(),
        this.loadRecentActivity(),
        this.loadTrend(),
      ]);
    } finally {
      this.loadingState.set(false);
    }
  }

  private async loadHoldsReady(): Promise<void> {
    const result = await this.holdsRepo.listHolds('ready', {
      page: 1,
      pageSize: HOLDS_READY_LIMIT,
    });
    this.holdsReadyErrorState.set(result.error);
    this.holdsReadyState.set(result.error ? [] : result.rows);
  }

  private async loadDueToday(): Promise<void> {
    const result = await this.circulationRepo.listDueToday({
      page: 1,
      pageSize: DUE_TODAY_LIMIT,
    });
    this.dueTodayErrorState.set(result.error);
    this.dueTodayState.set(result.error ? [] : result.rows);
  }

  /** Same overdue_loans read backs both the list and the stat card's count
   *  (ADR-0002) — the two can never drift apart. */
  private async loadTopOverdue(): Promise<void> {
    const result = await this.circulationRepo.listOverdue({
      page: 1,
      pageSize: TOP_OVERDUE_LIMIT,
    });
    this.topOverdueErrorState.set(result.error);
    if (result.error) {
      this.topOverdueState.set([]);
      return;
    }
    this.topOverdueState.set(result.rows);
    this.overdueCountState.set(result.total);
  }

  private async loadHoldsWaitingCount(): Promise<void> {
    const result = await this.holdsRepo.countByStatus('waiting');
    this.holdsWaitingCountErrorState.set(result.error);
    if (!result.error) {
      this.holdsWaitingCountState.set(result.count);
    }
  }

  private async loadFinesSummary(): Promise<void> {
    const summary = await this.finesRepo.summary();
    this.finesSummaryErrorState.set(summary.error);
    if (!summary.error && summary.row) {
      this.finesOutstandingState.set(summary.row.outstandingBalance);
    }
  }

  private async loadRecentActivity(): Promise<void> {
    const result = await this.auditRepo.listRecent(RECENT_ACTIVITY_LIMIT);
    this.recentActivityErrorState.set(result.error);
    this.recentActivityState.set(result.error ? [] : result.rows);
  }

  private async loadTrend(): Promise<void> {
    const result = await this.circulationRepo.getCheckoutTrend();
    this.trendErrorState.set(result.error);
    this.trendState.set(result.error ? [] : result.rows);
  }
}
