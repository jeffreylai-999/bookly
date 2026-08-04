import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LUCIDE_ICONS,
  LucideIconProvider,
  ScanBarcode,
  Search,
} from 'lucide-angular';
import { of } from 'rxjs';

import en from '../../../public/i18n/en.json';
import { ThrowingMissingKeyHandler } from '../core/i18n/missing-key-handler';
import { ToastService } from '../ui';
import { CirculationDesk } from './circulation-desk';
import { CirculationRepository } from './circulation.repository';

describe('CirculationDesk', () => {
  async function setup(queryParams: Record<string, string> = {}) {
    const toast = { show: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        CirculationDesk,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(queryParams) },
            // The nested check-out panel (app-circulation) also injects
            // ActivatedRoute reactively for its own member/copy scan params.
            queryParamMap: of(convertToParamMap({})),
          },
        },
        ThrowingMissingKeyHandler,
        { provide: ToastService, useValue: toast },
        {
          provide: CirculationRepository,
          useValue: {
            searchMembers: vi.fn().mockResolvedValue({ rows: [], error: null }),
            findMemberByCard: vi.fn(),
            findCopyByBarcode: vi.fn(),
            findActiveLoanByBarcode: vi.fn(),
            getOverdueProjection: vi.fn(),
            getSettings: vi.fn().mockResolvedValue({ row: null, error: null }),
            checkout: vi.fn(),
            checkin: vi.fn(),
            listLoans: vi.fn().mockResolvedValue({ rows: [], total: 0, error: null }),
            listOverdue: vi.fn().mockResolvedValue({ rows: [], total: 0, error: null }),
          },
        },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({
            ScanBarcode,
            Search,
            ChevronsUpDown,
            ChevronLeft,
            ChevronRight,
          }),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CirculationDesk);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, toast };
  }

  function tabButton(host: HTMLElement, label: string): HTMLButtonElement {
    const button = [...host.querySelectorAll('[role="radio"]')].find((b) =>
      (b.textContent ?? '').trim().includes(label),
    ) as HTMLButtonElement | undefined;
    expect(button, `tab "${label}"`).toBeTruthy();
    return button as HTMLButtonElement;
  }

  it('starts on check-out and switches to the check-in and loans panels', async () => {
    const { fixture } = await setup();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-circulation')?.closest('div')?.hasAttribute('hidden')).toBe(
      false,
    );
    expect(
      host.querySelector('app-checkin-panel')?.closest('div')?.hasAttribute('hidden'),
    ).toBe(true);

    tabButton(host, 'Check in').click();
    fixture.detectChanges();

    expect(host.querySelector('app-checkin-panel')?.closest('div')?.hasAttribute('hidden')).toBe(
      false,
    );
    expect(host.querySelector('app-circulation')?.closest('div')?.hasAttribute('hidden')).toBe(
      true,
    );

    tabButton(host, 'Loans').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('app-loans-panel')?.closest('div')?.hasAttribute('hidden')).toBe(
      false,
    );
  });

  it('opens on the check-in panel when the Overview quick action deep-links ?tab=checkin', async () => {
    const { fixture } = await setup({ tab: 'checkin' });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-checkin-panel')?.closest('div')?.hasAttribute('hidden')).toBe(
      false,
    );
    expect(host.querySelector('app-circulation')?.closest('div')?.hasAttribute('hidden')).toBe(
      true,
    );
  });

  it('falls back to check-out for an unrecognized ?tab= value', async () => {
    const { fixture } = await setup({ tab: 'not-a-real-tab' });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-circulation')?.closest('div')?.hasAttribute('hidden')).toBe(
      false,
    );
  });

  it('keeps panels mounted across tab switches', async () => {
    const { fixture } = await setup();
    const host = fixture.nativeElement as HTMLElement;

    tabButton(host, 'Check in').click();
    fixture.detectChanges();
    tabButton(host, 'Check out').click();
    fixture.detectChanges();

    // Hidden, not destroyed — an in-progress queue survives a tab round-trip.
    expect(host.querySelector('app-checkin-panel')).not.toBeNull();
    expect(host.querySelector('app-circulation')).not.toBeNull();
  });

  it('has no serious accessibility violations', async () => {
    const { fixture } = await setup();
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
