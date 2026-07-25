import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiBarChart } from './bar-chart';

@Component({
  imports: [UiBarChart],
  template: `<ui-bar-chart [series]="data" chartLabel="Checkouts per day" />`,
})
class Host {
  data = [
    { label: 'Mon', value: 50 },
    { label: 'Tue', value: 100, secondary: 25 },
  ];
}

describe('UiBarChart', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  it('scales bars to max value and renders secondary series', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Checkouts per day');
    const primaries = el.querySelectorAll('[data-testid="bar-primary"]') as NodeListOf<HTMLElement>;
    expect(primaries[0].style.height).toBe('50%');
    expect(primaries[1].style.height).toBe('100%');
    const secondary = el.querySelector('[data-testid="bar-secondary"]') as HTMLElement;
    expect(secondary.style.height).toBe('25%');
    expect(primaries[1].title).toContain('Tue');
    expect(el.textContent).toContain('Mon');
  });
});
