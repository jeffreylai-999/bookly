import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiProgress } from './progress';

@Component({
  imports: [UiProgress],
  template: `<ui-progress [value]="150" [max]="100" label="Fiction" color="cyan" />`,
})
class Host {}

describe('UiProgress', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  it('clamps fill to 100% and sets ARIA', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const track = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(track.getAttribute('aria-valuenow')).toBe('150');
    const fill = track.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
    expect(fill.className).toContain('bg-chart-cyan');
    expect(el.textContent).toContain('Fiction');
  });
});
