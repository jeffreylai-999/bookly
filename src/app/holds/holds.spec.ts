import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslocoMissingHandler, TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';
import {
  ChevronLeft,
  ChevronRight,
  LUCIDE_ICONS,
  LucideIconProvider,
  Search,
  X,
} from 'lucide-angular';

import en from '../../../public/i18n/en.json';
import { ThrowingMissingKeyHandler } from '../core/i18n';
import { ToastService } from '../ui';
import { Holds } from './holds';
import { HoldsStore } from './holds.store';
import type { HoldListItem } from './holds.types';

function holdRow(overrides: Partial<HoldListItem>): HoldListItem {
  return {
    id: 'h1',
    title_id: 't1',
    member_id: 'm1',
    queue_position: 1,
    status: 'waiting',
    copy_id: null,
    ready_at: null,
    expires_at: null,
    created_at: '2026-07-20T00:00:00Z',
    title: { title: 'Dune', author: 'Herbert' },
    member: { name: 'Ada Lovelace', card_barcode: 'MBR-1' },
    copy: null,
    ...overrides,
  };
}

const headRow = holdRow({});
const behindRow = holdRow({ id: 'h2', member_id: 'm2', queue_position: 2 });
const readyRow = holdRow({
  id: 'h3',
  title_id: 't2',
  status: 'ready',
  queue_position: 1,
  copy_id: 'c9',
  ready_at: '2026-07-30T00:00:00Z',
  expires_at: '2099-08-06T00:00:00Z',
  title: { title: 'Foundation', author: 'Asimov' },
  copy: { barcode: 'BK-900' },
});

describe('Holds', () => {
  async function setup(
    rows: HoldListItem[] = [],
    storeOverrides: Record<string, unknown> = {},
  ) {
    const rowsSig = signal<HoldListItem[]>(rows);
    const totalSig = signal(rows.length);
    const statusSig = signal('');
    const pageSig = signal(1);
    const errorSig = signal<string | null>(null);
    const busyIdSig = signal<string | null>(null);

    const store = {
      rows: rowsSig.asReadonly(),
      total: totalSig.asReadonly(),
      status: statusSig.asReadonly(),
      page: pageSig.asReadonly(),
      pageSize: signal(10).asReadonly(),
      loading: signal(false).asReadonly(),
      error: errorSig.asReadonly(),
      busyId: busyIdSig.asReadonly(),
      hasActiveFilters: signal(false).asReadonly(),
      isEmpty: signal(rows.length === 0).asReadonly(),
      queueHeadIds: signal(new Set(rows.length ? ['h1'] : [])).asReadonly(),
      load: vi.fn().mockResolvedValue(undefined),
      applyStatus: vi.fn().mockResolvedValue(undefined),
      applyPage: vi.fn().mockResolvedValue(undefined),
      clearFilters: vi.fn().mockResolvedValue(undefined),
      markReady: vi.fn().mockResolvedValue({ ok: true }),
      cancelHold: vi.fn().mockResolvedValue({ ok: true }),
      ...storeOverrides,
    };

    const toast = { show: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        Holds,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: ToastService, useValue: toast },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ Search, X, ChevronLeft, ChevronRight }),
        },
      ],
    })
      .overrideComponent(Holds, {
        set: { providers: [{ provide: HoldsStore, useValue: store }] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(Holds);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, store, toast };
  }

  it('lists the queue with member, title, position, and status', async () => {
    const { fixture } = await setup([headRow, behindRow, readyRow]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Dune');
    expect(text).toContain('#2');
    expect(text).toContain('BK-900');
    expect(text).toContain('Ready');
    expect(text).toContain('3 holds');
  });

  it('offers mark-ready only on the queue head', async () => {
    const { fixture } = await setup([headRow, behindRow]);
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    const markReadyButtons = buttons.filter((b) =>
      (b.textContent ?? '').trim().startsWith('Mark ready'),
    );

    expect(markReadyButtons).toHaveLength(1);
  });

  it('mark-ready scans a copy for the head of the queue', async () => {
    const { fixture, store, toast } = await setup([headRow]);
    const host = fixture.nativeElement as HTMLElement;

    const openButton = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').trim().startsWith('Mark ready'),
    ) as HTMLButtonElement;
    openButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.textContent ?? '').toContain('head of the queue');
    expect(host.textContent ?? '').toContain('Ada Lovelace');

    const input = host.querySelector('ui-dialog input') as HTMLInputElement;
    input.value = 'BK-100';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const confirmButton = [...host.querySelectorAll('ui-dialog button')].find(
      (b) => (b.textContent ?? '').trim() === 'Mark ready',
    ) as HTMLButtonElement;
    confirmButton.click();
    await fixture.whenStable();

    expect(store.markReady).toHaveBeenCalledWith('t1', 'BK-100');
    expect(toast.show).toHaveBeenCalledWith('Hold marked ready for Ada Lovelace.');
  });

  it('shows a typed error inside the mark-ready dialog', async () => {
    const { fixture, store } = await setup([headRow], {
      markReady: vi.fn().mockResolvedValue({ ok: false, error: 'copy_not_available' }),
    });
    const host = fixture.nativeElement as HTMLElement;

    const openButton = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').trim().startsWith('Mark ready'),
    ) as HTMLButtonElement;
    openButton.click();
    fixture.detectChanges();

    const input = host.querySelector('ui-dialog input') as HTMLInputElement;
    input.value = 'BK-100';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const confirmButton = [...host.querySelectorAll('ui-dialog button')].find(
      (b) => (b.textContent ?? '').trim() === 'Mark ready',
    ) as HTMLButtonElement;
    confirmButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'That copy is not available to pull.',
    );
    expect(store.markReady).toHaveBeenCalled();
  });

  it('cancels a hold from the row action', async () => {
    const { fixture, store, toast } = await setup([headRow]);
    const host = fixture.nativeElement as HTMLElement;

    const cancelButton = [...host.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === 'Cancel',
    ) as HTMLButtonElement;
    cancelButton.click();
    await fixture.whenStable();

    expect(store.cancelHold).toHaveBeenCalledWith('h1');
    expect(toast.show).toHaveBeenCalledWith('Hold cancelled.');
  });

  it('shows an empty state when no holds exist', async () => {
    const { fixture } = await setup([]);
    expect((fixture.nativeElement as HTMLElement).textContent ?? '').toContain('No holds yet');
  });

  it('has no serious accessibility violations', async () => {
    const { fixture } = await setup([headRow, behindRow, readyRow]);
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no serious accessibility violations with the mark-ready dialog open', async () => {
    const { fixture } = await setup([headRow]);
    const host = fixture.nativeElement as HTMLElement;

    const openButton = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').trim().startsWith('Mark ready'),
    ) as HTMLButtonElement;
    openButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const results = await axe.run(host, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
