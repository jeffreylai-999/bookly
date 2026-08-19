import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LUCIDE_ICONS,
  LucideIconProvider,
  X,
} from 'lucide-angular';

import {
  UiDateRange,
  rangeForPreset,
  toIsoDate,
  type DateRangeValue,
} from './date-range';

@Component({
  imports: [UiDateRange],
  template: `<ui-date-range [from]="from()" [to]="to()" (rangeChange)="onRange($event)" />`,
})
class Host {
  from = signal('2026-08-04');
  to = signal('2026-10-22');
  last: DateRangeValue | null = null;

  onRange(value: DateRangeValue): void {
    this.last = value;
    this.from.set(value.from);
    this.to.set(value.to);
  }
}

describe('date range helpers', () => {
  it('computes last week as seven inclusive days ending today', () => {
    expect(rangeForPreset('lastWeek', new Date(2026, 7, 19))).toEqual({
      from: '2026-08-13',
      to: '2026-08-19',
    });
  });

  it('computes last month and last 3 months as rolling windows', () => {
    const today = new Date(2026, 7, 19);
    expect(rangeForPreset('lastMonth', today)).toEqual({ from: '2026-07-19', to: '2026-08-19' });
    expect(rangeForPreset('last3Months', today)).toEqual({ from: '2026-05-19', to: '2026-08-19' });
  });
});

describe('UiDateRange', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({
            Calendar,
            ChevronLeft,
            ChevronRight,
            ChevronsLeft,
            ChevronsRight,
            X,
          }),
        },
      ],
    }).compileComponents();
  });

  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      root,
      trigger: root.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement,
    };
  };

  it('shows the committed range on the trigger', async () => {
    const { trigger } = await render();
    expect(trigger.textContent).toContain('2026-08-04');
    expect(trigger.textContent).toContain('To');
    expect(trigger.textContent).toContain('2026-10-22');
    const separator = Array.from(trigger.querySelectorAll('span')).find((el) =>
      el.textContent?.trim() === 'To',
    );
    expect(separator?.className).toContain('text-ink-muted');
    expect(separator?.className).toContain('px-3.5');
  });

  it('opens a shadowed, animated panel with presets and two months', async () => {
    const { trigger, root, fixture } = await render();
    trigger.click();
    await fixture.whenStable();

    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain('shadow-toast');
    expect(panel.className).toContain('date-range-in');
    expect(panel.textContent).toContain('Last week');
    expect(panel.textContent).toContain('Last month');
    expect(panel.textContent).toContain('Last 3 months');
    expect(panel.querySelectorAll('[data-iso]').length).toBe(84);
  });

  it('emits a sorted range after two day clicks', async () => {
    const { trigger, root, fixture, host } = await render();
    trigger.click();
    await fixture.whenStable();

    (root.querySelector('[data-iso="2026-08-20"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root.querySelector('[data-iso="2026-08-10"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(host.last).toEqual({ from: '2026-08-10', to: '2026-08-20' });
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('applies a quick-action preset', async () => {
    const { trigger, root, fixture, host } = await render();
    trigger.click();
    await fixture.whenStable();

    const lastWeek = Array.from(root.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Last week'),
    );
    lastWeek!.click();
    await fixture.whenStable();

    const expected = rangeForPreset('lastWeek', new Date());
    expect(host.last).toEqual(expected);
    expect(trigger.textContent).toContain(expected.from);
    expect(trigger.textContent).toContain(expected.to);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('clears the range from the trigger', async () => {
    const { root, fixture, host } = await render();
    const clear = root.querySelector('[aria-label="Clear dates"]') as HTMLButtonElement;
    clear.click();
    await fixture.whenStable();
    expect(host.last).toEqual({ from: '', to: '' });
  });
});

describe('toIsoDate', () => {
  it('formats local calendar days as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 7, 4))).toBe('2026-08-04');
  });
});
