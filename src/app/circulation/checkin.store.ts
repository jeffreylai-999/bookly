import { Service, computed, inject, signal } from '@angular/core';

import { CirculationRepository, type DeskSettings } from './circulation.repository';
import type {
  CheckinCandidate,
  CheckinCondition,
  CheckinError,
  CheckinResult,
  CheckinSuccess,
} from './circulation.types';

@Service()
export class CheckinStore {
  private readonly repo = inject(CirculationRepository);

  private readonly candidateState = signal<CheckinCandidate | null>(null);
  private readonly conditionState = signal<CheckinCondition>('ok');
  private readonly damagedAmountState = signal('');
  /** False while the field shows the prefilled default — an untouched prefill is
   *  not a staff override, so confirm leaves p_damaged_amount to the RPC default. */
  private readonly damagedEditedState = signal(false);
  private readonly settingsState = signal<DeskSettings | null>(null);
  private readonly busyState = signal(false);
  private readonly resultState = signal<CheckinSuccess | null>(null);

  readonly candidate = this.candidateState.asReadonly();
  readonly condition = this.conditionState.asReadonly();
  readonly damagedAmount = this.damagedAmountState.asReadonly();
  readonly settings = this.settingsState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly result = this.resultState.asReadonly();

  readonly projection = computed(() => this.candidateState()?.projection ?? null);

  readonly damagedAmountValid = computed(() => {
    if (this.conditionState() !== 'damaged') return true;
    if (!this.damagedEditedState()) return true;
    const raw = this.damagedAmountState().trim();
    if (!raw) return false;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0;
  });

  readonly canConfirm = computed(
    () => this.candidateState() !== null && !this.busyState() && this.damagedAmountValid(),
  );

  async selectCopyByBarcode(
    barcode: string,
  ): Promise<{ error: CheckinError | 'lookup_failed' | null }> {
    const code = barcode.trim();
    if (!code) return { error: 'copy_not_found' };

    this.busyState.set(true);
    try {
      const { row, error } = await this.repo.findActiveLoanByBarcode(code);
      if (error) return { error: 'lookup_failed' };
      if (!row) return { error: 'loan_not_found' };

      // Settings (damaged-fee default, currency) are a soft dependency: if the
      // read fails, the scan still lands and the damaged field just starts empty.
      if (!this.settingsState()) {
        const settings = await this.repo.getSettings();
        if (settings.row) {
          this.settingsState.set(settings.row);
        }
      }

      const projection = await this.repo.getOverdueProjection(row.loan.id);
      if (projection.error) return { error: 'lookup_failed' };

      this.candidateState.set({ ...row, projection: projection.row });
      this.conditionState.set('ok');
      // Re-prefill per scan so a previous override never leaks into the next check-in.
      this.damagedAmountState.set(
        this.settingsState()?.damaged_fee_default.toFixed(2) ?? '',
      );
      this.damagedEditedState.set(false);
      this.resultState.set(null);
      return { error: null };
    } finally {
      this.busyState.set(false);
    }
  }

  setCondition(condition: CheckinCondition): void {
    this.conditionState.set(condition);
  }

  setDamagedAmount(value: string): void {
    this.damagedAmountState.set(value);
    this.damagedEditedState.set(true);
  }

  async confirm(): Promise<CheckinResult> {
    const candidate = this.candidateState();
    if (!candidate) return { ok: false, error: 'copy_not_found' };

    const condition = this.conditionState();
    let damagedAmount: number | undefined;
    if (condition === 'damaged' && this.damagedEditedState()) {
      // Number('') is 0 — guard the empty string explicitly before parsing.
      const raw = this.damagedAmountState().trim();
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed < 0) {
        return { ok: false, error: 'invalid_damaged_amount' };
      }
      damagedAmount = parsed;
    }

    this.busyState.set(true);
    try {
      const result = await this.repo.checkin(
        candidate.copy.barcode,
        condition,
        damagedAmount,
      );
      if (!result.ok) return result;

      this.candidateState.set(null);
      this.conditionState.set('ok');
      this.resultState.set(result);
      return result;
    } finally {
      this.busyState.set(false);
    }
  }

  reset(): void {
    this.candidateState.set(null);
    this.conditionState.set('ok');
    this.resultState.set(null);
    this.busyState.set(false);
  }
}
