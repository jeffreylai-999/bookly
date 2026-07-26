import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiSkeleton } from './skeleton';

@Component({
  imports: [UiSkeleton],
  template: `<ui-skeleton [rows]="rows()" [ragged]="ragged()" [height]="height()" />`,
})
class Host {
  rows = signal(3);
  ragged = signal(true);
  height = signal(14);
}

describe('UiSkeleton', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  const render = async (): Promise<
    [ReturnType<typeof TestBed.createComponent<Host>>, HTMLElement]
  > => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return [fixture, fixture.nativeElement as HTMLElement];
  };

  it('renders one bar per row at the requested height', async () => {
    const [, el] = await render();
    const bars = el.querySelectorAll('span');
    expect(bars.length).toBe(3);
    expect((bars[0] as HTMLElement).style.height).toBe('14px');
  });

  it('varies widths when ragged and squares them off when not', async () => {
    const [fixture, el] = await render();
    const widths = () =>
      Array.from(el.querySelectorAll('span')).map((s) => (s as HTMLElement).style.width);
    expect(new Set(widths()).size).toBeGreaterThan(1);

    fixture.componentInstance.ragged.set(false);
    await fixture.whenStable();
    expect(new Set(widths())).toEqual(new Set(['100%']));
  });

  it('hides itself from assistive tech, which should hear one loading message not N bars', async () => {
    const [, el] = await render();
    expect(el.querySelector('ui-skeleton')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('stops the pulse under prefers-reduced-motion', async () => {
    const [, el] = await render();
    expect(el.querySelector('span')?.className).toContain('motion-reduce:animate-none');
  });

  it('always renders at least one bar', async () => {
    const [fixture, el] = await render();
    fixture.componentInstance.rows.set(0);
    await fixture.whenStable();
    expect(el.querySelectorAll('span').length).toBe(1);
  });
});
