import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiKpiCard } from './kpi-card';

@Component({
  imports: [UiKpiCard],
  template: `<ui-kpi-card label="Books on loan" [value]="342" delta="12% vs yesterday" deltaTone="good" [hero]="true" />`,
})
class Host {}

describe('UiKpiCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
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
});
