import { ApplicationRef, Service, computed, inject, resource, signal } from '@angular/core';

import { AuditRepository } from '../audit/audit.repository';
import { AppSettingsService } from '../core/app-settings';
import { CirculationRepository } from '../circulation/circulation.repository';
import { FinesRepository } from '../fines/fines.repository';
import { HoldsRepository } from '../holds/holds.repository';
import {
  DUE_TODAY_LIMIT,
  HOLDS_READY_LIMIT,
  RECENT_ACTIVITY_LIMIT,
  TOP_OVERDUE_LIMIT,
} from './overview.types';

/** Loaders throw `Error`s, so the message is the section's own failure text. */
function errorMessage(error: unknown): string | null {
  if (error == null) {
    return null;
  }
  return error instanceof Error ? error.message : String(error);
}

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
  private readonly appRef = inject(ApplicationRef);

  /** `undefined` keeps every read idle until the initial imperative load. */
  private readonly initialization = signal<number | undefined>(undefined);
  private readonly settingsLoading = signal(false);
  private initializationNonce = 0;

  private readonly holdsReadyResource = resource({
    params: () => this.initialization(),
    loader: async () => {
      const result = await this.holdsRepo.listHolds('ready', {
        page: 1,
        pageSize: HOLDS_READY_LIMIT,
      });
      if (result.error) {
        throw new Error(result.error);
      }
      return result.rows;
    },
  });

  private readonly dueTodayResource = resource({
    params: () => this.initialization(),
    loader: async () => {
      const result = await this.circulationRepo.listDueToday({
        page: 1,
        pageSize: DUE_TODAY_LIMIT,
      });
      if (result.error) {
        throw new Error(result.error);
      }
      return result.rows;
    },
  });

  /** Same overdue_loans read backs both the list and the stat card's count
   *  (ADR-0002) — the two can never drift apart. */
  private readonly topOverdueResource = resource({
    params: () => this.initialization(),
    loader: async () => {
      const result = await this.circulationRepo.listOverdue({
        page: 1,
        pageSize: TOP_OVERDUE_LIMIT,
      });
      if (result.error) {
        throw new Error(result.error);
      }
      return { rows: result.rows, total: result.total };
    },
  });

  private readonly holdsWaitingCountResource = resource({
    params: () => this.initialization(),
    loader: async () => {
      const result = await this.holdsRepo.countByStatus('waiting');
      if (result.error) {
        throw new Error(result.error);
      }
      return result.count;
    },
  });

  private readonly finesSummaryResource = resource({
    params: () => this.initialization(),
    loader: async () => {
      const result = await this.finesRepo.summary();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.row;
    },
  });

  private readonly recentActivityResource = resource({
    params: () => this.initialization(),
    loader: async () => {
      const result = await this.auditRepo.listRecent(RECENT_ACTIVITY_LIMIT);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.rows;
    },
  });

  private readonly trendResource = resource({
    params: () => this.initialization(),
    loader: async () => {
      const result = await this.circulationRepo.getCheckoutTrend();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.rows;
    },
  });

  readonly loading = computed(
    () =>
      this.settingsLoading() ||
      this.holdsReadyResource.isLoading() ||
      this.dueTodayResource.isLoading() ||
      this.topOverdueResource.isLoading() ||
      this.holdsWaitingCountResource.isLoading() ||
      this.finesSummaryResource.isLoading() ||
      this.recentActivityResource.isLoading() ||
      this.trendResource.isLoading(),
  );

  readonly holdsReady = computed(() =>
    this.holdsReadyResource.error() ? [] : (this.holdsReadyResource.value() ?? []),
  );
  readonly holdsReadyError = computed(() => errorMessage(this.holdsReadyResource.error()));

  readonly dueToday = computed(() =>
    this.dueTodayResource.error() ? [] : (this.dueTodayResource.value() ?? []),
  );
  readonly dueTodayError = computed(() => errorMessage(this.dueTodayResource.error()));

  readonly topOverdue = computed(() =>
    this.topOverdueResource.error() ? [] : (this.topOverdueResource.value()?.rows ?? []),
  );
  readonly topOverdueError = computed(() => errorMessage(this.topOverdueResource.error()));
  readonly overdueCount = computed(() =>
    this.topOverdueResource.error() ? 0 : (this.topOverdueResource.value()?.total ?? 0),
  );

  readonly holdsWaitingCount = computed(() =>
    this.holdsWaitingCountResource.error() ? 0 : (this.holdsWaitingCountResource.value() ?? 0),
  );
  readonly holdsWaitingCountError = computed(() =>
    errorMessage(this.holdsWaitingCountResource.error()),
  );

  readonly finesOutstanding = computed(() =>
    this.finesSummaryResource.error()
      ? 0
      : (this.finesSummaryResource.value()?.outstandingBalance ?? 0),
  );
  readonly finesSummaryError = computed(() => errorMessage(this.finesSummaryResource.error()));
  readonly currency = this.appSettings.currency;

  readonly recentActivity = computed(() =>
    this.recentActivityResource.error() ? [] : (this.recentActivityResource.value() ?? []),
  );
  readonly recentActivityError = computed(() => errorMessage(this.recentActivityResource.error()));

  readonly trend = computed(() =>
    this.trendResource.error() ? [] : (this.trendResource.value() ?? []),
  );
  readonly trendError = computed(() => errorMessage(this.trendResource.error()));

  async init(): Promise<void> {
    const generation = ++this.initializationNonce;
    this.settingsLoading.set(true);
    this.initialization.set(generation);
    try {
      // Bridges promise-based callers until they can read the resource signals directly.
      await Promise.all([this.appSettings.load(), this.appRef.whenStable()]);
    } finally {
      if (generation === this.initializationNonce) {
        this.settingsLoading.set(false);
      }
    }
  }
}
