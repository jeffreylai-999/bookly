import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslocoMissingHandler, TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';
import { LUCIDE_ICONS, LucideIconProvider, X } from 'lucide-angular';

import { ThrowingMissingKeyHandler } from '../core/i18n';
import en from '../../../public/i18n/en.json';
import { Settings } from './settings';
import { SettingsStore } from './settings.store';
import { AppSettingsService } from '../core/app-settings';
import type { AppSettings, MemberType } from './settings.types';

const sampleType: MemberType = {
  id: 't1',
  name: 'Adult',
  loan_period_days: 21,
  renewal_limit: 2,
  borrow_cap: 10,
  fine_rate_per_day: 0.25,
  hold_expiry_days: 7,
  created_at: '2026-01-01T00:00:00Z',
};

const sampleSettings: AppSettings = {
  id: true,
  currency: 'USD',
  timezone: 'America/New_York',
  default_locale: 'en',
  fine_block_threshold: 10,
  damaged_fee_default: 10,
  lost_fee_default: 25,
  notify_on_hold_ready: true,
  notify_on_overdue: true,
  notify_on_payment: true,
  default_report_range_days: 14,
  expire_holds_last_run_date: null,
  notify_overdue_last_run_date: null,
  updated_at: '2026-01-01T00:00:00Z',
};

const lucideIcons = {
  provide: LUCIDE_ICONS,
  multi: true,
  useValue: new LucideIconProvider({ X }),
};

function createStoreFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    memberTypes: signal([sampleType]).asReadonly(),
    appSettings: signal(sampleSettings as AppSettings | null).asReadonly(),
    loading: signal(false).asReadonly(),
    saving: signal(false).asReadonly(),
    error: signal<string | null>(null).asReadonly(),
    init: vi.fn().mockResolvedValue(undefined),
    saveMemberType: vi.fn().mockResolvedValue({ error: null }),
    removeMemberType: vi.fn().mockResolvedValue({ error: null }),
    saveAppSettings: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

async function render(store: ReturnType<typeof createStoreFake>) {
  await TestBed.configureTestingModule({
    imports: [
      Settings,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      lucideIcons,
      provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
      { provide: SettingsStore, useValue: store },
      {
        provide: AppSettingsService,
        useValue: { currency: () => store.appSettings()?.currency ?? 'USD' },
      },
    ],
  })
    .overrideComponent(Settings, { set: { providers: [] } })
    .compileComponents();

  const fixture = TestBed.createComponent(Settings);
  await fixture.whenStable();
  return fixture;
}

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll('button')).find((btn) =>
    btn.textContent?.trim().includes(text),
  );
}

function setInputValue(root: HTMLElement, id: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);
  expect(input).toBeTruthy();
  input!.value = value;
  input!.dispatchEvent(new Event('input'));
}

describe('Settings', () => {
  it('renders member types and the app settings form populated from the store', async () => {
    const fixture = await render(createStoreFake());
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Adult');
    expect(root.textContent).toContain('21 days');
    expect(root.textContent).toContain('$0.25');

    const currency = root.querySelector<HTMLInputElement>('input.uppercase');
    expect(currency?.value).toBe('USD');

    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(checkboxes.length).toBe(3);
    expect(Array.from(checkboxes).every((box) => box.checked)).toBe(true);
  });

  it('keeps the type submit disabled until the required name is present', async () => {
    const store = createStoreFake();
    const fixture = await render(store);
    const root = fixture.nativeElement as HTMLElement;

    buttonByText(root, 'Add type')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const submitBtn = buttonByText(root, 'Create type')!;
    expect(submitBtn.disabled).toBe(true);

    const nameInput = document.querySelector<HTMLInputElement>('dialog[open] input');
    expect(nameInput).toBeTruthy();
    nameInput!.value = '  ';
    nameInput!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(submitBtn.disabled).toBe(true);

    nameInput!.value = 'Staff';
    nameInput!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(submitBtn.disabled).toBe(false);

    submitBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.saveMemberType).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: 'Staff', loanPeriodDays: 21 }),
    );
  });

  it('opens the edit dialog pre-filled and saves through the store', async () => {
    const store = createStoreFake();
    const fixture = await render(store);
    const root = fixture.nativeElement as HTMLElement;

    buttonByText(root, 'Edit')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const nameInput = document.querySelector<HTMLInputElement>('dialog[open] input');
    expect(nameInput?.value).toBe('Adult');

    buttonByText(root, 'Save changes')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.saveMemberType).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ name: 'Adult', borrowCap: 10 }),
    );
  });

  it('confirms deletes and shows the in-use error inside the dialog', async () => {
    const store = createStoreFake({
      removeMemberType: vi.fn().mockResolvedValue({ error: 'member_type_in_use' }),
    });
    const fixture = await render(store);
    const root = fixture.nativeElement as HTMLElement;

    buttonByText(root, 'Delete')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(root.textContent).toContain('Delete Adult?');

    buttonByText(root, 'Delete type')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.removeMemberType).toHaveBeenCalledWith('t1');
    expect(root.textContent).toContain('still has members');
  });

  it('flags an invalid currency and a bad timezone on the app settings form', async () => {
    const store = createStoreFake();
    const fixture = await render(store);
    const root = fixture.nativeElement as HTMLElement;

    const currency = root.querySelector<HTMLInputElement>('input.uppercase')!;
    currency.value = 'usd1';
    currency.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    const saveBtn = buttonByText(root, 'Save settings')!;
    expect(saveBtn.disabled).toBe(true);

    currency.value = 'EUR';
    currency.dispatchEvent(new Event('input'));

    const timezone = Array.from(root.querySelectorAll<HTMLInputElement>('input.font-mono')).find(
      (input) => input !== currency,
    )!;
    timezone.value = 'Not/AZone';
    timezone.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(saveBtn.disabled).toBe(true);

    timezone.value = 'Europe/London';
    timezone.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(saveBtn.disabled).toBe(false);

    saveBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'EUR', timezone: 'Europe/London' }),
    );
  });

  it('passes AXE wcag2a/aa on the settings page', async () => {
    const fixture = await render(createStoreFake());

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('passes AXE wcag2a/aa with the member type dialog open', async () => {
    const fixture = await render(createStoreFake());
    const root = fixture.nativeElement as HTMLElement;

    buttonByText(root, 'Add type')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('passes AXE wcag2a/aa with the delete confirmation open', async () => {
    const fixture = await render(createStoreFake());
    const root = fixture.nativeElement as HTMLElement;

    buttonByText(root, 'Delete')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
