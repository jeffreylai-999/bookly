import { CurrencyPipe } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';
import {
  ChevronsUpDown,
  LUCIDE_ICONS,
  LucideIconProvider,
  ScanBarcode,
  Search,
} from 'lucide-angular';

import en from '../../../public/i18n/en.json';
import { ThrowingMissingKeyHandler } from '../core/i18n/missing-key-handler';
import { ToastService } from '../ui';
import { CheckinPanel } from './checkin-panel';
import { CheckinStore } from './checkin.store';
import type {
  CheckinCandidate,
  CheckinCondition,
  CheckinSuccess,
  OverdueLoan,
} from './circulation.types';

const candidate: CheckinCandidate = {
  loan: {
    id: 'l1',
    copy_id: 'c1',
    member_id: 'm1',
    checked_out_by: 'p1',
    checked_out_at: '2026-07-01T00:00:00Z',
    due_at: '2026-07-10T00:00:00Z',
    returned_at: null,
    renew_count: 0,
    status: 'active',
    created_at: '2026-07-01T00:00:00Z',
  },
  copy: {
    id: 'c1',
    barcode: 'BK-100',
    status: 'on_loan',
    title_id: 't1',
    title: 'Dune',
    author: 'Herbert',
  },
  member: { id: 'm1', name: 'Ada Lovelace', card_barcode: 'MBR-1' },
  projection: null,
};

const projection: OverdueLoan = {
  loan_id: 'l1',
  copy_id: 'c1',
  copy_barcode: 'BK-100',
  title_id: 't1',
  title: 'Dune',
  author: 'Herbert',
  member_id: 'm1',
  member_name: 'Ada Lovelace',
  member_card_barcode: 'MBR-1',
  checked_out_at: '2026-07-01T00:00:00Z',
  due_at: '2026-07-10T00:00:00Z',
  days_late: 3,
  fine_rate_per_day: 0.25,
  projected_fine: 0.75,
};

const success: CheckinSuccess = {
  ok: true,
  loan: { ...candidate.loan, status: 'returned', returned_at: '2026-08-01T10:00:00Z' },
  copyStatus: 'available',
  condition: 'ok',
  daysLate: 3,
  fines: [
    {
      id: 'f1',
      member_id: 'm1',
      loan_id: 'l1',
      reason: 'overdue',
      amount: 0.75,
      status: 'outstanding',
      accrual_rule_snapshot: { days_late: 3, fine_rate_per_day: 0.25 },
      created_at: '2026-08-01T10:00:00Z',
    },
  ],
};

describe('CheckinPanel', () => {
  async function setup(storeOverrides: Record<string, unknown> = {}) {
    const candidateSig = signal<CheckinCandidate | null>(null);
    const conditionSig = signal<CheckinCondition>('ok');
    const damagedAmountSig = signal('10.00');
    const busySig = signal(false);
    const resultSig = signal<CheckinSuccess | null>(null);
    const canConfirmSig = signal(false);

    const store = {
      candidate: candidateSig.asReadonly(),
      condition: conditionSig.asReadonly(),
      damagedAmount: damagedAmountSig.asReadonly(),
      settings: signal({ currency: 'USD' }).asReadonly(),
      busy: busySig.asReadonly(),
      result: resultSig.asReadonly(),
      projection: signal<OverdueLoan | null>(null).asReadonly(),
      damagedAmountValid: signal(true).asReadonly(),
      canConfirm: canConfirmSig.asReadonly(),
      selectCopyByBarcode: vi.fn().mockResolvedValue({ error: null }),
      setCondition: vi.fn((c: CheckinCondition) => conditionSig.set(c)),
      setDamagedAmount: vi.fn(),
      confirm: vi.fn().mockResolvedValue(success),
      reset: vi.fn(() => {
        candidateSig.set(null);
        resultSig.set(null);
      }),
      ...storeOverrides,
      _candidateSig: candidateSig,
      _conditionSig: conditionSig,
      _resultSig: resultSig,
      _canConfirmSig: canConfirmSig,
    };

    const toast = { show: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        CheckinPanel,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        ThrowingMissingKeyHandler,
        { provide: ToastService, useValue: toast },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ ScanBarcode, Search, ChevronsUpDown }),
        },
      ],
    })
      .overrideComponent(CheckinPanel, {
        set: {
          providers: [{ provide: CheckinStore, useValue: store }, CurrencyPipe],
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(CheckinPanel);
    fixture.detectChanges();
    return { fixture, store, toast };
  }

  it('shows the scanned copy with its on-time badge', async () => {
    const { fixture, store } = await setup();
    store._candidateSig.set(candidate);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Dune');
    expect(text).toContain('BK-100');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('On time');
  });

  it('shows the overdue projection from the view', async () => {
    const { fixture, store } = await setup({
      projection: signal(projection).asReadonly(),
    });
    store._candidateSig.set({ ...candidate, projection });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('3 days late');
    expect(text).toContain('$0.75');
  });

  it('reveals the damage charge field only for a damaged return', async () => {
    const { fixture, store } = await setup();
    store._candidateSig.set(candidate);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('input[type="number"]')).toBeNull();

    const damaged = [...host.querySelectorAll('[role="radio"]')].find((b) =>
      (b.textContent ?? '').trim().includes('Damaged'),
    ) as HTMLButtonElement;
    damaged.click();
    store._conditionSig.set('damaged');
    fixture.detectChanges();

    expect(store.setCondition).toHaveBeenCalledWith('damaged');
    expect(host.querySelector('input[type="number"]')).not.toBeNull();
  });

  it('confirms and toasts the result', async () => {
    const { fixture, store, toast } = await setup();
    store._candidateSig.set(candidate);
    store._canConfirmSig.set(true);
    fixture.detectChanges();

    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Check in'),
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    await fixture.whenStable();

    expect(store.confirm).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalled();
  });

  it('toasts a typed error when the RPC rejects', async () => {
    const { fixture, store, toast } = await setup({
      confirm: vi.fn().mockResolvedValue({ ok: false, error: 'loan_not_found' }),
    });
    store._candidateSig.set(candidate);
    store._canConfirmSig.set(true);
    fixture.detectChanges();

    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Check in'),
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(toast.error).toHaveBeenCalledWith('That copy is not on loan.');
  });

  it('lists created fines on the result summary', async () => {
    const { fixture, store } = await setup();
    store._resultSig.set(success);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Checked in');
    expect(text).toContain('Overdue');
    expect(text).toContain('$0.75');
    expect(text).toContain('3 days × $0.25 per day');
  });

  it('has no serious accessibility violations on the empty panel', async () => {
    const { fixture } = await setup();
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no serious accessibility violations with a candidate and damaged condition', async () => {
    const { fixture, store } = await setup();
    store._candidateSig.set(candidate);
    store._conditionSig.set('damaged');
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
