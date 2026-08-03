import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslocoMissingHandler, TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';
import { of } from 'rxjs';

import type { LoanListItem } from '../circulation/circulation.types';
import { AuthService } from '../core/auth';
import { ThrowingMissingKeyHandler } from '../core/i18n';
import type { FineListItem } from '../fines/fines.types';
import type { HoldListItem } from '../holds/holds.types';
import en from '../../../public/i18n/en.json';
import { ToastService } from '../ui';
import { MemberDetail } from './member-detail';
import { MemberDetailStore } from './member-detail.store';
import type { MemberListItem } from './members.types';

const member: MemberListItem = {
  id: 'm1',
  name: 'Ada Lovelace',
  member_type_id: 't1',
  email: 'ada@example.com',
  phone: '555-0100',
  avatar_url: null,
  status: 'active',
  joined_at: '2026-01-15T00:00:00Z',
  card_barcode: 'MBR-ADA-1',
  created_at: '2026-01-15T00:00:00Z',
  member_type: { id: 't1', name: 'Adult' },
};

const loan: LoanListItem = {
  id: 'l1',
  copy_id: 'c1',
  member_id: 'm1',
  checked_out_by: 'p1',
  checked_out_at: '2026-07-01T00:00:00Z',
  due_at: '2026-07-22T00:00:00Z',
  returned_at: null,
  renew_count: 0,
  status: 'active',
  created_at: '2026-07-01T00:00:00Z',
  copy: { id: 'c1', barcode: 'BK-100', title: 'Dune', author: 'Herbert' },
  member: { id: 'm1', name: 'Ada Lovelace', card_barcode: 'MBR-ADA-1' },
};

const hold: HoldListItem = {
  id: 'h1',
  title_id: 't1',
  member_id: 'm1',
  queue_position: 2,
  status: 'waiting',
  copy_id: null,
  ready_at: null,
  expires_at: null,
  created_at: '2026-07-20T00:00:00Z',
  title: { title: 'Foundation', author: 'Asimov' },
  member: { name: 'Ada Lovelace', card_barcode: 'MBR-ADA-1' },
  copy: null,
};

const fine: FineListItem = {
  id: 'f1',
  member_id: 'm1',
  loan_id: 'l0',
  amount: 0.75,
  amount_paid: 0.25,
  reason: 'overdue',
  status: 'partial',
  accrual_rule_snapshot: { days_late: 3, fine_rate_per_day: 0.25 },
  created_at: '2026-08-01T10:00:00Z',
  member: { id: 'm1', name: 'Ada Lovelace', card_barcode: 'MBR-ADA-1' },
  loan: null,
};

describe('MemberDetail', () => {
  async function setup(storeOverrides: Record<string, unknown> = {}, isAdmin = false) {
    const memberSig = signal<MemberListItem | null>(member);
    const memberLoadingSig = signal(false);
    const memberErrorSig = signal<string | null>(null);
    const notFoundSig = signal(false);
    const statusSavingSig = signal(false);
    const loansSig = signal<LoanListItem[]>([loan]);
    const loansLoadingSig = signal(false);
    const loansErrorSig = signal<string | null>(null);
    const renewingIdSig = signal<string | null>(null);
    const holdsSig = signal<HoldListItem[]>([hold]);
    const holdsLoadingSig = signal(false);
    const holdsErrorSig = signal<string | null>(null);
    const finesSig = signal<FineListItem[]>([fine]);
    const finesLoadingSig = signal(false);
    const finesErrorSig = signal<string | null>(null);
    const moneySig = signal<{ balance: number; projected: number } | null>({
      balance: 5,
      projected: 1.5,
    });
    const moneyErrorSig = signal<string | null>(null);

    const store = {
      member: memberSig.asReadonly(),
      memberLoading: memberLoadingSig.asReadonly(),
      memberError: memberErrorSig.asReadonly(),
      notFound: notFoundSig.asReadonly(),
      statusSaving: statusSavingSig.asReadonly(),
      loans: loansSig.asReadonly(),
      loansLoading: loansLoadingSig.asReadonly(),
      loansError: loansErrorSig.asReadonly(),
      renewingId: renewingIdSig.asReadonly(),
      holds: holdsSig.asReadonly(),
      holdsLoading: holdsLoadingSig.asReadonly(),
      holdsError: holdsErrorSig.asReadonly(),
      fines: finesSig.asReadonly(),
      finesLoading: finesLoadingSig.asReadonly(),
      finesError: finesErrorSig.asReadonly(),
      money: moneySig.asReadonly(),
      moneyError: moneyErrorSig.asReadonly(),
      currency: signal('USD').asReadonly(),
      init: vi.fn().mockResolvedValue(undefined),
      setMemberStatus: vi.fn().mockResolvedValue({ error: null }),
      renew: vi
        .fn()
        .mockResolvedValue({ ok: true, loan: { ...loan, due_at: '2026-08-12T00:00:00Z' } }),
      ...storeOverrides,
      _memberSig: memberSig,
      _notFoundSig: notFoundSig,
      _memberErrorSig: memberErrorSig,
    };

    const toast = { show: vi.fn(), error: vi.fn() };
    const route = {
      paramMap: of(convertToParamMap({ id: 'm1' })),
    };

    await TestBed.configureTestingModule({
      imports: [
        MemberDetail,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: route },
        { provide: AuthService, useValue: { isAdmin: signal(isAdmin).asReadonly() } },
      ],
    })
      .overrideComponent(MemberDetail, {
        set: { providers: [{ provide: MemberDetailStore, useValue: store }] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(MemberDetail);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, store, toast };
  }

  it('inits the store with the routed member id', async () => {
    const { store } = await setup();
    expect(store.init).toHaveBeenCalledWith('m1');
  });

  it('shows contact info, status, loans, holds, and fine history', async () => {
    const { fixture } = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('ada@example.com');
    expect(text).toContain('555-0100');
    expect(text).toContain('Dune');
    expect(text).toContain('BK-100');
    expect(text).toContain('Foundation');
    expect(text).toContain('#2');
    expect(text).toContain('Overdue');
    expect(text).toContain('$5.00');
    expect(text).toContain('Balance $5.00 · projected +$1.50');
  });

  it('shows an empty state for a panel with no rows', async () => {
    const { fixture } = await setup({ holds: signal([]).asReadonly() });
    expect((fixture.nativeElement as HTMLElement).textContent ?? '').toContain('No holds');
  });

  it('shows the not-found state when the member does not exist', async () => {
    const { fixture } = await setup({ notFound: signal(true).asReadonly() });
    expect((fixture.nativeElement as HTMLElement).textContent ?? '').toContain('Member not found');
  });

  it('renews a loan from the loans panel', async () => {
    const { fixture, store, toast } = await setup();
    const host = fixture.nativeElement as HTMLElement;

    const renewButton = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').trim().startsWith('Renew'),
    ) as HTMLButtonElement;
    renewButton.click();
    await fixture.whenStable();

    expect(store.renew).toHaveBeenCalledWith(loan);
    expect(toast.show).toHaveBeenCalledWith('Renewed · due Aug 12, 2026');
  });

  it('surfaces a typed renew error with the same circulation copy', async () => {
    const { fixture, toast } = await setup({
      renew: vi.fn().mockResolvedValue({ ok: false, error: 'loan_overdue' }),
    });
    const host = fixture.nativeElement as HTMLElement;

    const renewButton = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').trim().startsWith('Renew'),
    ) as HTMLButtonElement;
    renewButton.click();
    await fixture.whenStable();

    expect(toast.error).toHaveBeenCalledWith(
      'This loan is overdue — check it in instead of renewing.',
    );
  });

  it('hides block and shows suspend for staff', async () => {
    const { fixture } = await setup({}, false);
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map(
      (b) => b.textContent?.trim() ?? '',
    );
    expect(labels).toContain('Suspend');
    expect(labels).not.toContain('Block');
  });

  it('shows block for admin and suspends the member on click', async () => {
    const { fixture, store, toast } = await setup({}, true);
    const host = fixture.nativeElement as HTMLElement;
    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
    expect(labels).toContain('Block');

    const suspendButton = [...host.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === 'Suspend',
    ) as HTMLButtonElement;
    suspendButton.click();
    await fixture.whenStable();

    expect(store.setMemberStatus).toHaveBeenCalledWith('suspended');
    expect(toast.show).toHaveBeenCalledWith('Member status updated');
  });

  it('has no serious accessibility violations', async () => {
    const { fixture } = await setup();
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no serious accessibility violations on the not-found state', async () => {
    const { fixture } = await setup({ notFound: signal(true).asReadonly() });
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
