import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  SegmentedOption,
  ToastService,
  UiBadge,
  UiBtn,
  UiCard,
  UiEmptyState,
  UiField,
  UiSearchInput,
  UiSegmented,
} from '../ui';
import { fineReasonTone } from '../fines/fines.types';
import type { Json } from '../core/supabase';
import { CheckinStore } from './checkin.store';
import {
  CHECKIN_ERROR_KEYS,
  type CheckinCondition,
  type CheckinError,
  type CheckinFine,
} from './circulation.types';

const CONDITION_NOTE_KEYS: Record<CheckinCondition, string> = {
  ok: 'circulation.checkin.condition.okNote',
  damaged: 'circulation.checkin.condition.damagedNote',
  lost: 'circulation.checkin.condition.lostNote',
};

const RESULT_STATUS_KEYS: Record<CheckinCondition, string> = {
  ok: 'circulation.checkin.result.copyAvailable',
  damaged: 'circulation.checkin.result.copyDamaged',
  lost: 'circulation.checkin.result.copyLost',
};

@Component({
  selector: 'app-checkin-panel',
  providers: [CheckinStore, CurrencyPipe],
  imports: [
    CurrencyPipe,
    DatePipe,
    TranslocoPipe,
    UiBadge,
    UiBtn,
    UiCard,
    UiEmptyState,
    UiField,
    UiSearchInput,
    UiSegmented,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h2 class="text-[15px] font-bold text-ink-heading">
          {{ 'circulation.checkin.title' | transloco }}
        </h2>
        <p class="mt-0.5 text-[12.5px] text-ink-muted">
          {{ 'circulation.checkin.subtitle' | transloco }}
        </p>
      </div>

      <div class="grid gap-5 lg:grid-cols-2">
        <ui-card
          [title]="'circulation.checkin.scan.heading' | transloco"
          [subtitle]="'circulation.checkin.scan.hint' | transloco"
        >
          <ui-search-input
            class="w-full"
            [scan]="true"
            [placeholder]="'circulation.checkin.scan.scanPlaceholder' | transloco"
            [ariaLabel]="'circulation.checkin.scan.scanLabel' | transloco"
            (submitted)="onScan($event)"
          />

          @if (store.candidate(); as candidate) {
            <div class="mt-4 rounded-[10px] border border-line bg-canvas px-4 py-3">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-ink-heading">
                    {{ candidate.copy.title }}
                  </p>
                  <p class="mt-0.5 truncate text-xs text-ink-muted">
                    {{ candidate.copy.author }}
                  </p>
                  <p class="mt-1 text-xs font-medium tabular-nums text-ink-muted">
                    {{ candidate.copy.barcode }}
                  </p>
                  <p class="mt-2 text-xs text-ink-muted">
                    {{ candidate.member.name }} · {{ candidate.member.card_barcode }}
                  </p>
                  <p class="mt-1 text-xs text-ink-muted">
                    {{
                      'circulation.checkin.preview.due'
                        | transloco: { due: candidate.loan.due_at | date: 'mediumDate' }
                    }}
                  </p>
                </div>
                @if (store.projection(); as projection) {
                  <span uiBadge tone="warning">
                    {{
                      'circulation.checkin.preview.overdue'
                        | transloco
                          : {
                              days: projection.days_late ?? 0,
                              fine:
                                (projection.projected_fine ?? 0) | currency: currency(),
                            }
                    }}
                  </span>
                } @else {
                  <span uiBadge tone="success">
                    {{ 'circulation.checkin.preview.onTime' | transloco }}
                  </span>
                }
              </div>
              <button uiBtn variant="pill-muted" type="button" class="mt-3" (click)="clear()">
                {{ 'circulation.checkin.scan.clear' | transloco }}
              </button>
            </div>
          } @else if (store.result(); as result) {
            <div
              class="mt-4 rounded-[10px] border border-line bg-canvas px-4 py-3"
              role="status"
            >
              <p class="text-sm font-bold text-success">
                {{ 'circulation.checkin.result.heading' | transloco }} ·
                {{ RESULT_STATUS_KEYS[result.condition] | transloco }}
              </p>
              @if (result.daysLate !== null) {
                <p class="mt-1 text-xs text-ink-muted">
                  {{ 'circulation.checkin.result.daysLate' | transloco: { days: result.daysLate } }}
                </p>
              }
              @if (result.fines.length > 0) {
                <p class="mt-3 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
                  {{ 'circulation.checkin.result.finesHeading' | transloco }}
                </p>
                <ul class="mt-1.5 flex flex-col gap-1.5">
                  @for (fine of result.fines; track fine.id) {
                    <li class="flex flex-wrap items-center gap-2 text-[13px] text-ink">
                      <span uiBadge [tone]="fineReasonTone(fine.reason)">
                        {{ 'circulation.checkin.reason.' + fine.reason | transloco }}
                      </span>
                      <span class="font-semibold tabular-nums">
                        {{ fine.amount | currency: currency() }}
                      </span>
                      @if (accrualLine(fine); as line) {
                        <span class="text-xs text-ink-muted">{{ line }}</span>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p class="mt-2 text-xs text-ink-muted">
                  {{ 'circulation.checkin.result.noFines' | transloco }}
                </p>
              }
              <button uiBtn variant="pill-muted" type="button" class="mt-3" (click)="clear()">
                {{ 'circulation.checkin.result.next' | transloco }}
              </button>
            </div>
          } @else {
            <ui-empty-state
              class="mt-2"
              [headline]="'circulation.checkin.scan.emptyHeadline' | transloco"
              [message]="'circulation.checkin.scan.emptyMessage' | transloco"
            />
          }
        </ui-card>

        <ui-card
          [title]="'circulation.checkin.condition.heading' | transloco"
          [subtitle]="'circulation.checkin.condition.hint' | transloco"
        >
          @if (store.candidate()) {
            <ui-segmented
              [options]="conditionOptions"
              [value]="store.condition()"
              (valueChange)="onConditionChange($event)"
              [groupLabel]="'circulation.checkin.condition.label' | transloco"
            />
            <p class="mt-2 text-xs text-ink-muted">{{ conditionNote() }}</p>

            @if (store.condition() === 'damaged') {
              <ui-field
                class="mt-4"
                [label]="'circulation.checkin.condition.damagedAmount' | transloco"
                [hint]="'circulation.checkin.condition.damagedAmountHint' | transloco"
                #damagedField
              >
                <input
                  [id]="damagedField.controlId"
                  [attr.aria-describedby]="damagedField.describedBy()"
                  type="number"
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                  class="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink focus-ring"
                  [value]="store.damagedAmount()"
                  (input)="onDamagedAmount($event)"
                />
              </ui-field>
            }

            <div class="mt-4 flex justify-end">
              <button
                uiBtn
                type="button"
                [disabled]="!store.canConfirm()"
                (click)="confirm()"
              >
                {{
                  (store.busy()
                    ? 'circulation.checkin.confirm.working'
                    : 'circulation.checkin.confirm.action')
                    | transloco
                }}
              </button>
            </div>
          } @else {
            <ui-empty-state
              class="mt-2"
              [headline]="'circulation.checkin.scan.emptyHeadline' | transloco"
              [message]="'circulation.checkin.scan.emptyMessage' | transloco"
            />
          }
        </ui-card>
      </div>
    </div>
  `,
})
export class CheckinPanel {
  protected readonly store = inject(CheckinStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly currencyPipe = inject(CurrencyPipe);

  protected readonly RESULT_STATUS_KEYS = RESULT_STATUS_KEYS;
  protected readonly fineReasonTone = fineReasonTone;

  protected readonly conditionOptions: SegmentedOption[] = (
    ['ok', 'damaged', 'lost'] as const
  ).map((value) => ({
    value,
    label: this.transloco.translate(`circulation.checkin.condition.${value}`),
  }));

  protected readonly conditionNote = computed(() =>
    this.transloco.translate(CONDITION_NOTE_KEYS[this.store.condition()]),
  );

  protected readonly currency = computed(() => this.store.settings()?.currency ?? 'USD');

  /** Renders the snapshotted accrual rule so staff can explain the charge. */
  protected accrualLine(fine: CheckinFine): string {
    const snapshot = fine.accrual_rule_snapshot as Record<string, Json | undefined> | null;
    switch (fine.reason) {
      case 'overdue': {
        const days = snapshot?.['days_late'];
        const rate = snapshot?.['fine_rate_per_day'];
        if (typeof days !== 'number' || typeof rate !== 'number') return '';
        return this.transloco.translate('circulation.checkin.result.accrualOverdue', {
          days,
          rate: this.currencyPipe.transform(rate, this.currency()),
        });
      }
      case 'damaged': {
        if (snapshot?.['overridden'] === true) {
          const feeDefault = snapshot?.['damaged_fee_default'];
          return this.transloco.translate('circulation.checkin.result.accrualDamagedOverride', {
            feeDefault:
              typeof feeDefault === 'number'
                ? this.currencyPipe.transform(feeDefault, this.currency())
                : '',
          });
        }
        return this.transloco.translate('circulation.checkin.result.accrualDamagedDefault');
      }
      case 'lost': {
        return this.transloco.translate(
          snapshot?.['basis'] === 'replacement_cost'
            ? 'circulation.checkin.result.accrualLostReplacement'
            : 'circulation.checkin.result.accrualLostDefault',
        );
      }
    }
  }

  protected async onScan(barcode: string): Promise<void> {
    const result = await this.store.selectCopyByBarcode(barcode);
    if (result.error) {
      this.showError(result.error === 'lookup_failed' ? 'unexpected' : result.error);
    }
  }

  protected onConditionChange(value: string | undefined): void {
    if (value) this.store.setCondition(value as CheckinCondition);
  }

  protected onDamagedAmount(event: Event): void {
    this.store.setDamagedAmount((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.store.reset();
  }

  protected async confirm(): Promise<void> {
    const result = await this.store.confirm();
    if (!result.ok) {
      this.showError(result.error);
      return;
    }
    this.toast.show(this.transloco.translate('circulation.checkin.result.heading'));
  }

  private showError(error: CheckinError): void {
    this.toast.error(this.transloco.translate(CHECKIN_ERROR_KEYS[error]));
  }
}
