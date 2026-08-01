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
import { Circulation } from './circulation';
import { CirculationRepository } from './circulation.repository';
import { CirculationStore } from './circulation.store';
import type { CheckoutCopy, CheckoutMember } from './circulation.types';

const member: CheckoutMember = {
  id: 'm1',
  name: 'Ada Lovelace',
  member_type_id: 't1',
  email: null,
  phone: null,
  avatar_url: null,
  status: 'active',
  joined_at: '2026-01-01T00:00:00Z',
  card_barcode: 'MBR-ADA-1',
  created_at: '2026-01-01T00:00:00Z',
  member_type: {
    id: 't1',
    name: 'Adult',
    loan_period_days: 21,
    borrow_cap: 10,
  },
};

const copy: CheckoutCopy = {
  id: 'c1',
  barcode: 'BK-001',
  status: 'available',
  title_id: 't1',
  title: 'Dune',
  author: 'Herbert',
};

describe('Circulation', () => {
  async function setup(storeOverrides: Partial<CirculationStore> = {}) {
    const memberSig = signal<CheckoutMember | null>(null);
    const queuedSig = signal<CheckoutCopy[]>([]);
    const busySig = signal(false);
    const dueSig = signal<string | null>(null);
    const canConfirmSig = signal(false);

    const store = {
      member: memberSig.asReadonly(),
      queuedCopies: queuedSig.asReadonly(),
      busy: busySig.asReadonly(),
      lastDueAt: dueSig.asReadonly(),
      canConfirm: canConfirmSig.asReadonly(),
      setMember: vi.fn((m: CheckoutMember | null) => memberSig.set(m)),
      selectMemberByCard: vi.fn().mockResolvedValue({ error: null }),
      queueCopyByBarcode: vi.fn().mockResolvedValue({ error: null }),
      removeCopy: vi.fn(),
      confirmCheckout: vi.fn().mockResolvedValue({ ok: true }),
      reset: vi.fn(() => {
        memberSig.set(null);
        queuedSig.set([]);
      }),
      ...storeOverrides,
      // expose writers for tests
      _memberSig: memberSig,
      _queuedSig: queuedSig,
      _canConfirmSig: canConfirmSig,
      _dueSig: dueSig,
    };

    const toast = { show: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        Circulation,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        ThrowingMissingKeyHandler,
        { provide: CirculationStore, useValue: store },
        {
          provide: CirculationRepository,
          useValue: {
            searchMembers: vi.fn().mockResolvedValue({ rows: [], error: null }),
            findMemberByCard: vi.fn(),
            findCopyByBarcode: vi.fn(),
            checkout: vi.fn(),
          },
        },
        { provide: ToastService, useValue: toast },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ ScanBarcode, Search, ChevronsUpDown }),
        },
      ],
    })
      .overrideComponent(Circulation, {
        set: { providers: [{ provide: CirculationStore, useValue: store }] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(Circulation);
    fixture.detectChanges();
    return { fixture, store, toast };
  }

  it('shows selected member and queues copies for confirm', async () => {
    const { fixture, store, toast } = await setup();
    store._memberSig.set(member);
    store._queuedSig.set([copy]);
    store._canConfirmSig.set(true);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('BK-001');
    expect(text).toContain('Dune');

    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Check out'),
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    await fixture.whenStable();
    expect(store.confirmCheckout).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalled();
  });

  it('toasts a typed gate error when confirm fails', async () => {
    const { fixture, store, toast } = await setup({
      confirmCheckout: vi.fn().mockResolvedValue({ ok: false, error: 'member_suspended' }),
    });
    store._memberSig.set(member);
    store._queuedSig.set([copy]);
    store._canConfirmSig.set(true);
    fixture.detectChanges();

    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Check out'),
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(toast.error).toHaveBeenCalledWith(
      'This member is suspended and cannot check out.',
    );
  });

  it('has no serious accessibility violations on the empty desk', async () => {
    const { fixture } = await setup();
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
