import { CurrencyPipe, DatePipe, formatDate } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';

import { AuthService } from '../core/auth';
import type { LoanListItem } from '../circulation/circulation.types';
import { RENEW_ERROR_KEYS } from '../circulation/circulation.types';
import { fineBalance, fineReasonTone, fineStatusTone } from '../fines/fines.types';
import type { FineListItem } from '../fines/fines.types';
import { holdStatusTone } from '../holds/holds.types';
import type { HoldListItem } from '../holds/holds.types';
import {
  TableColumn,
  ToastService,
  UiAvatar,
  UiBadge,
  UiBtn,
  UiCard,
  UiCellDef,
  UiEmptyState,
  UiSkeleton,
  UiTable,
} from '../ui';
import { MemberDetailStore } from './member-detail.store';
import { statusBadgeTone, type MemberStatus } from './members.types';

const STATUS_LABEL_KEYS: Record<MemberStatus, string> = {
  active: 'members.status.active',
  suspended: 'members.status.suspended',
  blocked: 'members.status.blocked',
};

@Component({
  selector: 'app-member-detail',
  providers: [MemberDetailStore],
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    TranslocoPipe,
    UiAvatar,
    UiBadge,
    UiBtn,
    UiCard,
    UiCellDef,
    UiEmptyState,
    UiSkeleton,
    UiTable,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <a routerLink="/members" class="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-brand-dark hover:underline focus-ring rounded">
        {{ 'members.detail.back' | transloco }}
      </a>

      @if (store.memberLoading() && !store.member() && !store.notFound()) {
        <div role="status" aria-live="polite" class="flex flex-col gap-2.5">
          <span class="sr-only">{{ 'members.detail.loading' | transloco }}</span>
          <ui-skeleton [rows]="4" />
        </div>
      } @else if (store.notFound()) {
        <ui-empty-state
          [headline]="'members.detail.notFoundHeadline' | transloco"
          [message]="'members.detail.notFoundMessage' | transloco"
        />
      } @else if (store.memberError()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'members.detail.errors.loadFailed' | transloco }}
        </p>
      } @else if (store.member(); as member) {
        <div class="flex flex-wrap items-center gap-3">
          <ui-avatar [name]="member.name" [size]="44" />
          <div>
            <h2 class="text-[17px] font-bold text-ink-heading">{{ member.name }}</h2>
            <p class="text-[12.5px] text-ink-muted">{{ member.card_barcode }}</p>
          </div>
        </div>

        <div class="grid gap-5 lg:grid-cols-2">
          <ui-card [title]="'members.detail.contact.heading' | transloco">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <dl class="flex flex-col gap-1.5 text-sm">
                <div>
                  <dt class="sr-only">{{ 'members.detail.contact.email' | transloco }}</dt>
                  <dd class="text-ink">
                    {{ member.email ?? ('members.detail.contact.noEmail' | transloco) }}
                  </dd>
                </div>
                <div>
                  <dt class="sr-only">{{ 'members.detail.contact.phone' | transloco }}</dt>
                  <dd class="text-ink">
                    {{ member.phone ?? ('members.detail.contact.noPhone' | transloco) }}
                  </dd>
                </div>
                <div>
                  <dt class="sr-only">{{ 'members.columns.joined' | transloco }}</dt>
                  <dd class="text-ink-muted">
                    {{
                      'members.detail.contact.joined'
                        | transloco: { date: member.joined_at | date: 'mediumDate' }
                    }}
                  </dd>
                </div>
                <div>
                  <dt class="sr-only">{{ 'members.columns.type' | transloco }}</dt>
                  <dd class="text-ink-muted">
                    {{ member.member_type?.name ?? ('members.unknownType' | transloco) }}
                  </dd>
                </div>
              </dl>
              <span uiBadge [tone]="statusBadgeTone(member.status)">
                {{ statusLabel(member.status) }}
              </span>
            </div>

            @if (statusActions().length > 0) {
              <div class="mt-4 flex flex-wrap gap-2">
                @for (action of statusActions(); track action.status) {
                  <button
                    uiBtn
                    variant="pill"
                    type="button"
                    [disabled]="store.statusSaving()"
                    (click)="onStatusAction(action.status)"
                  >
                    {{ action.labelKey | transloco }}
                  </button>
                }
              </div>
            }
          </ui-card>

          <ui-card [title]="'members.detail.money.heading' | transloco">
            @if (store.moneyError()) {
              <p role="alert" class="text-sm font-semibold text-danger">
                {{ 'members.detail.money.errors.loadFailed' | transloco }}
              </p>
            } @else if (store.money(); as money) {
              <p
                class="text-2xl font-extrabold tracking-[-0.02em]"
                [class]="money.balance > 0 ? 'text-warning' : 'text-ink-heading'"
              >
                {{ money.balance | currency: store.currency() }}
              </p>
              <p class="mt-1 text-[13px] text-ink-muted">
                {{
                  'circulation.member.money'
                    | transloco
                      : {
                          balance: money.balance | currency: store.currency(),
                          projected: money.projected | currency: store.currency(),
                        }
                }}
              </p>
            } @else {
              <ui-skeleton [rows]="2" />
            }
          </ui-card>
        </div>

        <ui-card
          [title]="'members.detail.loans.heading' | transloco"
          [subtitle]="'members.detail.loans.subtitle' | transloco: { count: store.loans().length }"
        >
          @if (store.loansLoading()) {
            <ui-skeleton [rows]="3" />
          } @else if (store.loansError()) {
            <p role="alert" class="text-sm font-semibold text-danger">
              {{ 'members.detail.loans.errors.loadFailed' | transloco }}
            </p>
          } @else if (store.loans().length === 0) {
            <ui-empty-state
              [headline]="'members.detail.loans.empty.headline' | transloco"
              [message]="'members.detail.loans.empty.message' | transloco"
            />
          } @else {
            <ui-table
              [columns]="loanColumns"
              [rows]="store.loans()"
              [rowKey]="loanRowKey"
              [caption]="'members.detail.loans.tableCaption' | transloco"
              minWidth="640px"
            >
              <ng-template uiCell="title" let-row>
                <div>
                  <div class="font-semibold text-ink">{{ row.copy?.title }}</div>
                  <div class="text-xs text-ink-muted">{{ row.copy?.author }}</div>
                </div>
              </ng-template>
              <ng-template uiCell="barcode" let-row>
                <span class="font-medium tabular-nums">{{ row.copy?.barcode }}</span>
              </ng-template>
              <ng-template uiCell="due" let-row>
                {{ row.due_at | date: 'mediumDate' }}
              </ng-template>
              <ng-template uiCell="actions" let-row>
                <button
                  type="button"
                  uiBtn
                  variant="pill"
                  [disabled]="store.renewingId() !== null"
                  [attr.aria-label]="
                    'circulation.renew.actionFor'
                      | transloco
                        : { title: row.copy?.title ?? '', barcode: row.copy?.barcode ?? '' }
                  "
                  (click)="onRenew(row)"
                >
                  {{
                    (store.renewingId() === row.id
                      ? 'circulation.renew.working'
                      : 'circulation.renew.action'
                    ) | transloco
                  }}
                </button>
              </ng-template>
            </ui-table>
          }
        </ui-card>

        <ui-card
          [title]="'members.detail.holds.heading' | transloco"
          [subtitle]="'members.detail.holds.subtitle' | transloco: { count: store.holds().length }"
        >
          @if (store.holdsLoading()) {
            <ui-skeleton [rows]="3" />
          } @else if (store.holdsError()) {
            <p role="alert" class="text-sm font-semibold text-danger">
              {{ 'members.detail.holds.errors.loadFailed' | transloco }}
            </p>
          } @else if (store.holds().length === 0) {
            <ui-empty-state
              [headline]="'members.detail.holds.empty.headline' | transloco"
              [message]="'members.detail.holds.empty.message' | transloco"
            />
          } @else {
            <ui-table
              [columns]="holdColumns"
              [rows]="store.holds()"
              [rowKey]="holdRowKey"
              [caption]="'members.detail.holds.tableCaption' | transloco"
              minWidth="560px"
            >
              <ng-template uiCell="title" let-row>
                <div>
                  <div class="font-semibold text-ink">{{ row.title?.title }}</div>
                  <div class="text-xs text-ink-muted">{{ row.title?.author }}</div>
                </div>
              </ng-template>
              <ng-template uiCell="position" let-row>
                @if (row.status === 'waiting' || row.status === 'ready') {
                  <span class="tabular-nums text-ink">#{{ row.queue_position }}</span>
                } @else {
                  <span class="text-ink-muted">—</span>
                }
              </ng-template>
              <ng-template uiCell="expires" let-row>
                @if (row.expires_at) {
                  <span class="tabular-nums text-ink">{{ row.expires_at | date: 'mediumDate' }}</span>
                } @else {
                  <span class="text-ink-muted">—</span>
                }
              </ng-template>
              <ng-template uiCell="status" let-row>
                <span uiBadge [tone]="holdStatusTone(row.status)">
                  {{ 'holds.status.' + row.status | transloco }}
                </span>
              </ng-template>
            </ui-table>
          }
        </ui-card>

        <ui-card
          [title]="'members.detail.fines.heading' | transloco"
          [subtitle]="'members.detail.fines.subtitle' | transloco: { count: store.fines().length }"
        >
          @if (store.finesLoading()) {
            <ui-skeleton [rows]="3" />
          } @else if (store.finesError()) {
            <p role="alert" class="text-sm font-semibold text-danger">
              {{ 'members.detail.fines.errors.loadFailed' | transloco }}
            </p>
          } @else if (store.fines().length === 0) {
            <ui-empty-state
              [headline]="'members.detail.fines.empty.headline' | transloco"
              [message]="'members.detail.fines.empty.message' | transloco"
            />
          } @else {
            <ui-table
              [columns]="fineColumns"
              [rows]="store.fines()"
              [rowKey]="fineRowKey"
              [caption]="'members.detail.fines.tableCaption' | transloco"
              minWidth="620px"
            >
              <ng-template uiCell="reason" let-row>
                <span uiBadge [tone]="fineReasonTone(row.reason)">
                  {{ 'fines.reason.' + row.reason | transloco }}
                </span>
              </ng-template>
              <ng-template uiCell="amount" let-row>
                <span class="tabular-nums">{{ row.amount | currency: store.currency() }}</span>
              </ng-template>
              <ng-template uiCell="balance" let-row>
                <span class="font-semibold tabular-nums">
                  {{ fineBalance(row) | currency: store.currency() }}
                </span>
              </ng-template>
              <ng-template uiCell="status" let-row>
                <span uiBadge [tone]="fineStatusTone(row.status)">
                  {{ 'fines.status.' + row.status | transloco }}
                </span>
              </ng-template>
              <ng-template uiCell="created" let-row>
                {{ row.created_at | date: 'mediumDate' }}
              </ng-template>
            </ui-table>
          }
        </ui-card>
      }
    </div>
  `,
})
export class MemberDetail {
  protected readonly store = inject(MemberDetailStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);

  protected readonly statusBadgeTone = statusBadgeTone;
  protected readonly holdStatusTone = holdStatusTone;
  protected readonly fineReasonTone = fineReasonTone;
  protected readonly fineStatusTone = fineStatusTone;
  protected readonly fineBalance = fineBalance;

  protected readonly loanRowKey = (row: LoanListItem) => row.id;
  protected readonly holdRowKey = (row: HoldListItem) => row.id;
  protected readonly fineRowKey = (row: FineListItem) => row.id;

  protected readonly loanColumns: TableColumn<LoanListItem>[] = [
    { key: 'title', header: '', width: '38%' },
    { key: 'barcode', header: '', width: '20%' },
    { key: 'due', header: '', width: '20%' },
    { key: 'actions', header: '', width: '22%', align: 'right' },
  ];

  protected readonly holdColumns: TableColumn<HoldListItem>[] = [
    { key: 'title', header: '', width: '46%' },
    { key: 'position', header: '', width: '16%' },
    { key: 'expires', header: '', width: '18%' },
    { key: 'status', header: '', width: '20%' },
  ];

  protected readonly fineColumns: TableColumn<FineListItem>[] = [
    { key: 'reason', header: '', width: '18%' },
    { key: 'amount', header: '', width: '18%', align: 'right' },
    { key: 'balance', header: '', width: '18%', align: 'right' },
    { key: 'status', header: '', width: '18%' },
    { key: 'created', header: '', width: '18%' },
  ];

  private readonly memberId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: null as string | null },
  );

  private lastInitId: string | null = null;

  protected readonly statusActions = computed(() => {
    const member = this.store.member();
    if (!member) return [];
    const admin = this.auth.isAdmin();
    switch (member.status) {
      case 'active':
        return [
          { status: 'suspended' as const, labelKey: 'members.actions.suspend' },
          ...(admin ? [{ status: 'blocked' as const, labelKey: 'members.actions.block' }] : []),
        ];
      case 'suspended':
        return [
          { status: 'active' as const, labelKey: 'members.actions.lift' },
          ...(admin ? [{ status: 'blocked' as const, labelKey: 'members.actions.block' }] : []),
        ];
      case 'blocked':
        return admin ? [{ status: 'active' as const, labelKey: 'members.actions.unblock' }] : [];
      default: {
        const _exhaustive: never = member.status;
        return _exhaustive;
      }
    }
  });

  constructor() {
    // A router-link between two member-detail rows reuses this component
    // instance (same path pattern, different `:id`), so init() must react to
    // param changes rather than run once.
    effect(() => {
      const id = this.memberId();
      if (id && id !== this.lastInitId) {
        this.lastInitId = id;
        void this.store.init(id);
      }
    });
  }

  protected statusLabel(status: MemberStatus): string {
    return this.transloco.translate(STATUS_LABEL_KEYS[status]);
  }

  protected async onStatusAction(status: MemberStatus): Promise<void> {
    const result = await this.store.setMemberStatus(status);
    if (result.error === 'load_failed') {
      this.toast.error(this.transloco.translate('members.errors.loadFailed'));
      return;
    }
    if (result.error) {
      this.toast.error(this.transloco.translate('members.toasts.statusFailed'));
      return;
    }
    this.toast.show(this.transloco.translate('members.toasts.statusUpdated'));
  }

  protected async onRenew(loan: LoanListItem): Promise<void> {
    const result = await this.store.renew(loan);
    if (!result.ok) {
      this.toast.error(this.transloco.translate(RENEW_ERROR_KEYS[result.error]));
      return;
    }
    const dueLabel = formatDate(
      result.loan.due_at,
      'mediumDate',
      this.transloco.getActiveLang() || 'en',
    );
    this.toast.show(this.transloco.translate('circulation.renew.success', { due: dueLabel }));
  }
}
