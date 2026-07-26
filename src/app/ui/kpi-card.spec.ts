import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiKpiCard } from './kpi-card';

@Component({
  imports: [UiKpiCard],
  template: `<ui-kpi-card
    label="Books on loan"
    [value]="342"
    delta="12% vs yesterday"
    deltaTone="good"
    [hero]="true"
  />`,
})
class Host {}

@Component({
  imports: [UiKpiCard],
  template: `<ui-kpi-card
    label="Overdue"
    [value]="18"
    delta="4% vs last week"
    deltaTone="good"
    direction="down"
  />`,
})
class FallingHost {}

describe('UiKpiCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host, FallingHost] }).compileComponents();
  });

  it('renders label, hero value and good delta', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Books on loan');
    expect(el.textContent).toContain('342');
    const value = el.querySelector('[data-testid="kpi-value"]') as HTMLElement;
    expect(value.className).toContain('text-brand');
    const delta = el.querySelector('[data-testid="kpi-delta"]') as HTMLElement;
    expect(delta.className).toContain('text-success');
    expect(delta.textContent).toContain('▲');
  });

  it('states the direction in text, since the glyph is hidden and the tone is colour', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const delta = el.querySelector('[data-testid="kpi-delta"]') as HTMLElement;
    expect(delta.querySelector('[aria-hidden="true"]')?.textContent).toBe('▲');
    expect(delta.querySelector('.sr-only')?.textContent).toBe('Up');
  });

  it('separates direction from tone, so a falling metric can still be good news', async () => {
    const fixture = TestBed.createComponent(FallingHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const delta = el.querySelector('[data-testid="kpi-delta"]') as HTMLElement;
    expect(delta.querySelector('[aria-hidden="true"]')?.textContent).toBe('▼');
    expect(delta.querySelector('.sr-only')?.textContent).toBe('Down');
    expect(delta.className).toContain('text-success');
  });
});
