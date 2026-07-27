import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiBarChart } from './bar-chart';

@Component({
  imports: [UiBarChart],
  template: `<ui-bar-chart
    [series]="data"
    chartLabel="Checkouts per day"
    categoryLabel="Day"
    seriesLabel="Checkouts"
    secondaryLabel="Returns"
  />`,
})
class Host {
  data = [
    { label: 'Mon', value: 50 },
    { label: 'Tue', value: 100, secondary: 25 },
  ];
}

@Component({
  imports: [UiBarChart],
  template: `<ui-bar-chart [series]="data" chartLabel="Checkouts per day" />`,
})
class SingleSeriesHost {
  data = [{ label: 'Mon', value: 50 }];
}

describe('UiBarChart', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host, SingleSeriesHost],
    }).compileComponents();
  });

  it('scales bars to max value and renders secondary series', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const primaries = el.querySelectorAll('[data-testid="bar-primary"]') as NodeListOf<HTMLElement>;
    expect(primaries[0].style.height).toBe('50%');
    expect(primaries[1].style.height).toBe('100%');
    const secondary = el.querySelector('[data-testid="bar-secondary"]') as HTMLElement;
    expect(secondary.style.height).toBe('25%');
    expect(primaries[1].title).toContain('Tue');
    expect(el.textContent).toContain('Mon');
  });

  it('exposes every data point through a text table, not just the chart name', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const table = el.querySelector('table') as HTMLTableElement;
    expect(table.className).toContain('sr-only');
    expect(table.querySelector('caption')?.textContent?.trim()).toBe('Checkouts per day');
    expect(
      Array.from(table.querySelectorAll('thead th')).map((h) => h.textContent?.trim()),
    ).toEqual(['Day', 'Checkouts', 'Returns']);

    const rows = table.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('Tue');
    expect(rows[1].textContent).toContain('100');
    expect(rows[1].textContent).toContain('25');
  });

  it('hides the bars from assistive tech so the numbers are announced once', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const bars = el.querySelector('[data-testid="bar-primary"]')?.closest('[aria-hidden]');
    expect(bars?.getAttribute('aria-hidden')).toBe('true');
  });

  it('distinguishes the two series by more than hue', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // Teal and cyan are 1.42:1 apart, so the stripe and legend carry the split.
    const secondary = el.querySelector('[data-testid="bar-secondary"]') as HTMLElement;
    expect(secondary.style.backgroundImage).toContain('repeating-linear-gradient');
    expect(el.textContent).toContain('Returns');
  });

  it('omits the legend when there is only one series to name', async () => {
    const fixture = TestBed.createComponent(SingleSeriesHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('thead th').length).toBe(2);
    expect(el.querySelector('[data-testid="bar-secondary"]')).toBeNull();
  });
});
