import { CurrencyPipe } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LUCIDE_ICONS,
  LucideIconProvider,
  X,
} from 'lucide-angular';

import en from '../../../public/i18n/en.json';
import { AuthService } from '../core/auth';
import { ThrowingMissingKeyHandler } from '../core/i18n/missing-key-handler';
import { ToastService } from '../ui';
import { FinesList } from './fines-list';
import { FinesStore } from './fines.store';
import type {
  FineListItem,
  FineReceipt,
  FineStatusFilter,
  FineSummary,
  Payment,
} from './fines.types';

const fine: FineListItem = {
  id: 'f1',
  member_id: 'm1',
  loan_id: 'l1',
  amount: 10,
  amount_paid: 4,
  reason: 'damaged',
  status: 'partial',
  accrual_rule_snapshot: { charged_amount: 10, damaged_fee_default: 10, overridden: false },
  created_at: '2026-08-01T10:00:00Z',
  member: { id: 'm1', name: 'Ada Lovelace', card_barcode: 'MBR-1' },
  loan: {
    id: 'l1',
    due_at: '2026-07-20T00:00:00Z',
    returned_at: '2026-08-01T10:00:00Z',
    copy: {
      id: 'c1',
      barcode: 'BK-1',
      titles: { title: 'Dune', author: 'Frank Herbert' },
    },
  },
};

const paidFine: FineListItem = {
  ...fine,
  id: 'f2',
  amount_paid: 10,
  status: 'paid',
};

const paymentRow: Payment = {
  id: 'p1',
  fine_id: 'f1',
  amount: 4,
  method: 'cash',
  recorded_by: 'staff',
  voided_by: null,
  void_reason: null,
  voided_at: null,
  created_at: '2026-08-01T11:00:00Z',
};

const summaryRow: FineSummary = {
  outstandingBalance: 42.5,
  collectedTotal: 130,
  waivedTotal: 8,
};

const receiptRow: FineReceipt = {
  payment: paymentRow,
  fine: { ...fine, amount_paid: 6, status: 'partial' },
};

function submitForm(host: HTMLElement, id: string): void {
  const form = host.querySelector(`#${id}`) as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function setInputValue(host: HTMLElement, value: string): void {
  const input = host.querySelector('dialog[open] input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('FinesList', () => {
  async function setup(
    storeOverrides: Record<string, unknown> = {},
    options: { admin?: boolean } = {},
  ) {
    const rowsSig = signal<FineListItem[]>([]);
    const filterSig = signal<FineStatusFilter>('all');
    const summarySig = signal<FineSummary | null>(summaryRow);
    const selectedSig = signal<FineListItem | null>(null);
    const paymentsSig = signal<Payment[]>([]);
    const paymentsErrorSig = signal<string | null>(null);
    const receiptSig = signal<FineReceipt | null>(null);

    const store = {
      rows: rowsSig.asReadonly(),
      total: signal(0).asReadonly(),
      page: signal(1).asReadonly(),
      pageSize: 10,
      statusFilter: filterSig.asReadonly(),
      loading: signal(false).asReadonly(),
      error: signal<string | null>(null).asReadonly(),
      currency: signal('USD').asReadonly(),
      summary: summarySig.asReadonly(),
      summaryError: signal<string | null>(null).asReadonly(),
      selectedFine: selectedSig.asReadonly(),
      payments: paymentsSig.asReadonly(),
      paymentsLoading: signal(false).asReadonly(),
      paymentsError: paymentsErrorSig.asReadonly(),
      busy: signal(false).asReadonly(),
      receipt: receiptSig.asReadonly(),
      empty: signal(false).asReadonly(),
      init: vi.fn().mockResolvedValue(undefined),
      setStatusFilter: vi.fn(async (status: FineStatusFilter) => filterSig.set(status)),
      setPage: vi.fn().mockResolvedValue(undefined),
      openDetails: vi.fn(async (row: FineListItem) => {
        selectedSig.set(row);
        paymentsSig.set([paymentRow]);
      }),
      closeDetails: vi.fn(() => {
        selectedSig.set(null);
        paymentsSig.set([]);
      }),
      clearReceipt: vi.fn(() => receiptSig.set(null)),
      recordPayment: vi.fn(async () => {
        receiptSig.set(receiptRow);
        return { ok: true, receipt: receiptRow };
      }),
      waiveFine: vi.fn().mockResolvedValue({ ok: true, fine: { ...fine, status: 'waived' } }),
      voidPayment: vi.fn().mockResolvedValue({
        ok: true,
        payment: { ...paymentRow, voided_by: 'admin' },
        fine,
      }),
      ...storeOverrides,
      _rowsSig: rowsSig,
      _filterSig: filterSig,
      _summarySig: summarySig,
      _selectedSig: selectedSig,
      _paymentsSig: paymentsSig,
      _paymentsErrorSig: paymentsErrorSig,
      _receiptSig: receiptSig,
    };

    const toast = { show: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        FinesList,
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
          provide: AuthService,
          useValue: { isAdmin: signal(options.admin ?? false).asReadonly() },
        },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ ChevronsUpDown, ChevronLeft, ChevronRight, X }),
        },
      ],
    })
      .overrideComponent(FinesList, {
        set: { providers: [{ provide: FinesStore, useValue: store }, CurrencyPipe] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(FinesList);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, store, toast };
  }

  it('lists fines with reason, amounts, balance, and status', async () => {
    const { fixture, store } = await setup();
    store._rowsSig.set([fine]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Damaged');
    expect(text).toContain('$10.00');
    expect(text).toContain('$4.00');
    expect(text).toContain('$6.00');
    expect(text).toContain('Partial');
    expect(store.init).toHaveBeenCalled();
  });

  it('shows the three summary stat cards', async () => {
    const { fixture } = await setup();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Outstanding balance');
    expect(text).toContain('$42.50');
    expect(text).toContain('Collected');
    expect(text).toContain('$130.00');
    expect(text).toContain('Waived');
    expect(text).toContain('$8.00');
  });

  it('filters by status', async () => {
    const { fixture, store } = await setup();
    const host = fixture.nativeElement as HTMLElement;

    const outstanding = [...host.querySelectorAll('[role="radio"]')].find((b) =>
      (b.textContent ?? '').trim().includes('Outstanding'),
    ) as HTMLButtonElement;
    outstanding.click();
    await fixture.whenStable();

    expect(store.setStatusFilter).toHaveBeenCalledWith('outstanding');
  });

  it('shows the empty state when there are no fines', async () => {
    const { fixture } = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No fines yet');
  });

  it('offers Pay on a partial fine but not on a paid one', async () => {
    const { fixture, store } = await setup();
    store._rowsSig.set([fine, paidFine]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const rows = [...host.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Pay');
    expect(rows[1]?.textContent).not.toContain('Pay');
  });

  it('hides Waive from staff', async () => {
    const { fixture, store } = await setup();
    store._rowsSig.set([fine]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('tbody')?.textContent).not.toContain('Waive');
  });

  it('shows Waive to admins', async () => {
    const { fixture, store } = await setup({}, { admin: true });
    store._rowsSig.set([fine]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('tbody')?.textContent).toContain('Waive');
  });

  it('records a payment from the dialog and shows the receipt', async () => {
    const { fixture, store, toast } = await setup();
    store._rowsSig.set([fine]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const payButton = [...host.querySelectorAll('tbody button')].find((b) =>
      (b.textContent ?? '').includes('Pay'),
    ) as HTMLButtonElement;
    payButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Amount defaults to the remaining balance.
    const amountInput = host.querySelector('dialog[open] input') as HTMLInputElement;
    expect(amountInput.value).toBe('6.00');

    submitForm(host, 'payment-form');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.recordPayment).toHaveBeenCalledWith('f1', 6, 'cash');
    expect(toast.show).toHaveBeenCalled();

    const receiptDialog = [...host.querySelectorAll('dialog[open]')].find((d) =>
      (d.textContent ?? '').includes('Receipt confirmation'),
    );
    expect(receiptDialog).toBeTruthy();
    expect(receiptDialog?.textContent).toContain('Remaining balance');
  });

  it('blocks overpayment in the payment form', async () => {
    const { fixture, store } = await setup();
    store._rowsSig.set([fine]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const payButton = [...host.querySelectorAll('tbody button')].find((b) =>
      (b.textContent ?? '').includes('Pay'),
    ) as HTMLButtonElement;
    payButton.click();
    fixture.detectChanges();

    setInputValue(host, '99');
    fixture.detectChanges();
    submitForm(host, 'payment-form');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.recordPayment).not.toHaveBeenCalled();
    const dialog = host.querySelector('dialog[open]') as HTMLElement;
    expect(dialog.textContent).toContain("money never flows backward");
  });

  it('waives a fine with a reason (admin)', async () => {
    const { fixture, store, toast } = await setup({}, { admin: true });
    store._rowsSig.set([fine]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const waiveButton = [...host.querySelectorAll('tbody button')].find((b) =>
      (b.textContent ?? '').includes('Waive'),
    ) as HTMLButtonElement;
    waiveButton.click();
    fixture.detectChanges();

    // Reason required: confirm stays disabled while empty.
    const confirm = host.querySelector(
      'dialog[open] button[form="waive-form"]',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    setInputValue(host, 'goodwill');
    fixture.detectChanges();
    submitForm(host, 'waive-form');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.waiveFine).toHaveBeenCalledWith('f1', 'goodwill');
    expect(toast.show).toHaveBeenCalled();
  });

  it('shows origin, accrual rule, and payments in details; void is admin-only', async () => {
    const { fixture, store } = await setup({}, { admin: true });
    store._rowsSig.set([fine]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const detailsButton = [...host.querySelectorAll('tbody button')].find((b) =>
      (b.textContent ?? '').includes('Details'),
    ) as HTMLButtonElement;
    detailsButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.openDetails).toHaveBeenCalledWith(fine);

    const dialog = [...host.querySelectorAll('dialog[open]')].find((d) =>
      (d.textContent ?? '').includes('Fine details'),
    ) as HTMLElement;
    expect(dialog.textContent).toContain('Dune');
    expect(dialog.textContent).toContain('BK-1');
    expect(dialog.textContent).toContain('Default damaged fee charged');
    expect(dialog.textContent).toContain('$4.00');
    expect(dialog.textContent).toContain('Void');
  });

  it('shows an error in details when payments fail to load', async () => {
    const { fixture, store } = await setup({
      openDetails: vi.fn(async (row: FineListItem) => {
        store._selectedSig.set(row);
        store._paymentsErrorSig.set('boom');
      }),
    });
    store._rowsSig.set([fine]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const detailsButton = [...host.querySelectorAll('tbody button')].find((b) =>
      (b.textContent ?? '').includes('Details'),
    ) as HTMLButtonElement;
    detailsButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = [...host.querySelectorAll('dialog[open]')].find((d) =>
      (d.textContent ?? '').includes('Fine details'),
    ) as HTMLElement;
    expect(dialog.textContent).toContain("Couldn't load payments");
    expect(dialog.textContent).not.toContain('No payments yet');
  });

  it('hides the void action from staff in details', async () => {
    const { fixture, store } = await setup();
    store._rowsSig.set([fine]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const detailsButton = [...host.querySelectorAll('tbody button')].find((b) =>
      (b.textContent ?? '').includes('Details'),
    ) as HTMLButtonElement;
    detailsButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = [...host.querySelectorAll('dialog[open]')].find((d) =>
      (d.textContent ?? '').includes('Fine details'),
    ) as HTMLElement;
    expect(dialog.textContent).not.toContain('Void');
  });

  it('voids a payment with a reason (admin)', async () => {
    const { fixture, store, toast } = await setup({}, { admin: true });
    store._rowsSig.set([fine]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const detailsButton = [...host.querySelectorAll('tbody button')].find((b) =>
      (b.textContent ?? '').includes('Details'),
    ) as HTMLButtonElement;
    detailsButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const voidButton = [...host.querySelectorAll('dialog[open] button')].find(
      (b) => (b.textContent ?? '').trim() === 'Void',
    ) as HTMLButtonElement;
    voidButton.click();
    fixture.detectChanges();

    setInputValue(host, 'entered wrong amount');
    fixture.detectChanges();

    const voidForm = host.querySelector('dialog[open] li form') as HTMLFormElement;
    voidForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.voidPayment).toHaveBeenCalledWith('p1', 'entered wrong amount');
    expect(toast.show).toHaveBeenCalled();
  });

  it('has no serious accessibility violations', async () => {
    const { fixture, store } = await setup();
    store._rowsSig.set([fine]);
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
