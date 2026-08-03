import { CurrencyPipe, DatePipe, formatDate } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';

import {
  TableColumn,
  ToastService,
  UiBadge,
  UiBtn,
  UiCard,
  UiCellDef,
  UiEmptyState,
  UiSearchInput,
  UiTable,
} from '../ui';
import { CirculationRepository } from './circulation.repository';
import { CirculationStore } from './circulation.store';
import {
  CHECKOUT_ERROR_KEYS,
  memberStatusTone,
  type CheckoutCopy,
  type CheckoutError,
  type CheckoutMember,
  type MemberStatus,
} from './circulation.types';

const STATUS_LABEL_KEYS: Record<MemberStatus, string> = {
  active: 'members.status.active',
  suspended: 'members.status.suspended',
  blocked: 'members.status.blocked',
};

@Component({
  selector: 'app-circulation',
  providers: [CirculationStore],
  imports: [
    CurrencyPipe,
    DatePipe,
    TranslocoPipe,
    UiBadge,
    UiBtn,
    UiCard,
    UiCellDef,
    UiEmptyState,
    UiSearchInput,
    UiTable,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h2 class="text-[15px] font-bold text-ink-heading">
          {{ 'circulation.title' | transloco }}
        </h2>
        <p class="mt-0.5 text-[12.5px] text-ink-muted">
          {{ 'circulation.subtitle' | transloco }}
        </p>
      </div>

      <div class="grid gap-5 lg:grid-cols-2">
        <ui-card
          [title]="'circulation.member.heading' | transloco"
          [subtitle]="'circulation.member.hint' | transloco"
        >
          <ui-search-input
            class="w-full"
            [scan]="true"
            [placeholder]="'circulation.member.scanPlaceholder' | transloco"
            [ariaLabel]="'circulation.member.scanLabel' | transloco"
            (submitted)="onMemberScan($event)"
          />

          <div class="mt-3">
            <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
              {{ 'circulation.member.searchLabel' | transloco }}
            </p>
            <ui-search-input
              class="w-full"
              [placeholder]="'circulation.member.searchPlaceholder' | transloco"
              [ariaLabel]="'circulation.member.searchLabel' | transloco"
              (debouncedChange)="onMemberSearch($event)"
            />
          </div>

          @if (memberSuggestions().length > 0 && !store.member()) {
            <ul
              class="mt-2 divide-y divide-divider rounded-[10px] border border-line"
              role="listbox"
              [attr.aria-label]="'circulation.member.suggestions' | transloco"
            >
              @for (suggestion of memberSuggestions(); track suggestion.id) {
                <li role="option">
                  <button
                    type="button"
                    class="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-row-hover focus-ring"
                    (click)="selectMember(suggestion)"
                  >
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-semibold text-ink">{{
                        suggestion.name
                      }}</span>
                      <span class="block truncate text-xs text-ink-muted">{{
                        suggestion.card_barcode
                      }}</span>
                    </span>
                    <span uiBadge [tone]="memberStatusTone(suggestion.status)">
                      {{ statusLabel(suggestion.status) }}
                    </span>
                  </button>
                </li>
              }
            </ul>
          }

          @if (store.member(); as member) {
            <div class="mt-4 rounded-[10px] border border-line bg-canvas px-4 py-3">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold text-ink-heading">{{ member.name }}</p>
                  <p class="mt-0.5 text-xs text-ink-muted">{{ member.card_barcode }}</p>
                  <p class="mt-1 text-xs text-ink-muted">
                    {{
                      'circulation.member.typeRules'
                        | transloco
                          : {
                              type: member.member_type?.name ?? '',
                              days: member.member_type?.loan_period_days ?? 0,
                              cap: member.member_type?.borrow_cap ?? 0,
                            }
                    }}
                  </p>
                  @if (store.money(); as money) {
                    <p
                      class="mt-1 text-xs font-semibold"
                      [class]="money.balance > 0 ? 'text-warning' : 'text-ink-muted'"
                    >
                      {{
                        'circulation.member.money'
                          | transloco
                            : {
                                balance: money.balance | currency: store.currency(),
                                projected: money.projected | currency: store.currency(),
                              }
                      }}
                    </p>
                  }
                </div>
                <span uiBadge [tone]="memberStatusTone(member.status)">
                  {{ statusLabel(member.status) }}
                </span>
              </div>
              <button uiBtn variant="pill-muted" type="button" class="mt-3" (click)="clearMember()">
                {{ 'circulation.member.clear' | transloco }}
              </button>
            </div>
          }
        </ui-card>

        <ui-card
          [title]="'circulation.copies.heading' | transloco"
          [subtitle]="'circulation.copies.hint' | transloco"
        >
          @if (store.member()) {
            <ui-search-input
              class="w-full"
              [scan]="true"
              [placeholder]="'circulation.copies.scanPlaceholder' | transloco"
              [ariaLabel]="'circulation.copies.scanLabel' | transloco"
              (submitted)="onCopyScan($event)"
            />
          }

          @if (!store.member()) {
            <ui-empty-state
              class="mt-2"
              [headline]="'circulation.copies.needMemberHeadline' | transloco"
              [message]="'circulation.copies.needMemberMessage' | transloco"
            />
          } @else if (store.queuedCopies().length === 0) {
            <ui-empty-state
              class="mt-2"
              [headline]="'circulation.copies.emptyHeadline' | transloco"
              [message]="'circulation.copies.emptyMessage' | transloco"
            />
          } @else {
            <div class="mt-4">
              <ui-table
                [columns]="copyColumns"
                [rows]="store.queuedCopies()"
                [caption]="'circulation.copies.tableCaption' | transloco"
              >
                <ng-template uiCell="title" let-row>
                  <div>
                    <div class="font-semibold text-ink">{{ row.title }}</div>
                    <div class="text-xs text-ink-muted">{{ row.author }}</div>
                  </div>
                </ng-template>
                <ng-template uiCell="barcode" let-row>
                  <span class="font-medium tabular-nums">{{ row.barcode }}</span>
                </ng-template>
                <ng-template uiCell="actions" let-row>
                  <button uiBtn variant="pill-muted" type="button" (click)="removeCopy(row)">
                    {{ 'circulation.copies.remove' | transloco }}
                  </button>
                </ng-template>
              </ui-table>
            </div>
          }
        </ui-card>
      </div>

      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-6 py-4"
      >
        <div class="text-sm text-ink-muted">
          @if (store.lastDueAt(); as due) {
            <span role="status" class="font-semibold text-success">
              {{ 'circulation.toasts.checkedOut' | transloco: { due: due | date: 'mediumDate' } }}
            </span>
          } @else {
            {{
              'circulation.confirm.summary' | transloco: { count: store.queuedCopies().length }
            }}
          }
        </div>
        <button uiBtn type="button" [disabled]="!store.canConfirm()" (click)="confirm()">
          {{
            (store.busy() ? 'circulation.confirm.working' : 'circulation.confirm.action')
              | transloco
          }}
        </button>
      </div>
    </div>
  `,
})
export class Circulation {
  protected readonly store = inject(CirculationStore);
  private readonly repo = inject(CirculationRepository);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly memberSuggestions = signal<CheckoutMember[]>([]);
  protected readonly memberStatusTone = memberStatusTone;

  protected readonly copyColumns: TableColumn<CheckoutCopy>[] = [
    {
      key: 'title',
      header: this.transloco.translate('circulation.copies.columns.title'),
      width: '45%',
    },
    {
      key: 'barcode',
      header: this.transloco.translate('circulation.copies.columns.barcode'),
      width: '30%',
    },
    {
      key: 'actions',
      header: this.transloco.translate('circulation.copies.columns.actions'),
      width: '25%',
      align: 'right',
    },
  ];

  private readonly queryParams = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => ({
        member: params.get('member'),
        copy: params.get('copy'),
      })),
    ),
    { initialValue: { member: null as string | null, copy: null as string | null } },
  );

  /** Serializes query-param scan handling so member resolves before copy. */
  private queryHandleChain: Promise<void> = Promise.resolve();

  constructor() {
    effect(() => {
      const { member, copy } = this.queryParams();
      if (!member && !copy) return;
      this.queryHandleChain = this.queryHandleChain.then(() =>
        this.consumeQueryScans(member, copy),
      );
    });
  }

  private async consumeQueryScans(
    member: string | null,
    copy: string | null,
  ): Promise<void> {
    if (member) {
      await this.onMemberScan(member);
    }
    if (copy) {
      // Retry once if member query was also present and still settling.
      if (!this.store.member() && member) {
        await this.onMemberScan(member);
      }
      await this.onCopyScan(copy);
    }
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  protected statusLabel(status: MemberStatus): string {
    return this.transloco.translate(STATUS_LABEL_KEYS[status]);
  }

  protected selectMember(member: CheckoutMember): void {
    this.store.setMember(member);
    this.memberSuggestions.set([]);
  }

  protected clearMember(): void {
    this.store.reset();
    this.memberSuggestions.set([]);
  }

  protected async onMemberScan(barcode: string): Promise<void> {
    const result = await this.store.selectMemberByCard(barcode);
    if (result.error) {
      this.showError(result.error === 'lookup_failed' ? 'unexpected' : result.error);
    }
  }

  protected async onMemberSearch(query: string): Promise<void> {
    const q = query.trim();
    if (!q) {
      this.memberSuggestions.set([]);
      return;
    }
    const { rows, error } = await this.repo.searchMembers(q);
    if (error) {
      this.toast.error(this.transloco.translate('circulation.errors.unexpected'));
      return;
    }
    this.memberSuggestions.set(rows);
  }

  protected async onCopyScan(barcode: string): Promise<void> {
    if (!this.store.member()) {
      this.toast.error(this.transloco.translate('circulation.errors.memberRequired'));
      return;
    }
    const result = await this.store.queueCopyByBarcode(barcode);
    if (result.error) {
      this.showError(result.error === 'lookup_failed' ? 'unexpected' : result.error);
    }
  }

  protected removeCopy(copy: CheckoutCopy): void {
    this.store.removeCopy(copy.id);
  }

  protected async confirm(): Promise<void> {
    const result = await this.store.confirmCheckout();
    if (!result.ok) {
      this.showError(result.error);
      return;
    }
    const due = this.store.lastDueAt();
    const dueLabel = due
      ? formatDate(due, 'mediumDate', this.transloco.getActiveLang() || 'en')
      : '';
    this.toast.show(
      this.transloco.translate('circulation.toasts.checkedOut', { due: dueLabel }),
    );
  }

  private showError(error: CheckoutError): void {
    this.toast.error(this.transloco.translate(CHECKOUT_ERROR_KEYS[error]));
  }
}
