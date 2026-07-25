import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LUCIDE_ICONS, LucideIconProvider, ChevronLeft, ChevronRight } from 'lucide-angular';
import { UiPagination, pageCount, pageRange } from './pagination';

@Component({
  imports: [UiPagination],
  template: `<ui-pagination [(page)]="page" [pageSize]="10" [total]="total()" />`,
})
class Host {
  page = signal(1);
  total = signal(42);
}

describe('pagination math', () => {
  it('computes page count', () => {
    expect(pageCount(42, 10)).toBe(5);
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
  });
  it('computes visible range', () => {
    expect(pageRange(1, 10, 42)).toEqual({ from: 1, to: 10 });
    expect(pageRange(5, 10, 42)).toEqual({ from: 41, to: 42 });
    expect(pageRange(1, 10, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe('UiPagination', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ ChevronLeft, ChevronRight }),
        },
      ],
    }).compileComponents();
  });

  it('shows range text, disables prev on first page, navigates', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Showing 1–10 of 42');
    const prev = el.querySelector('[aria-label="Previous page"]') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    const page2 = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === '2')!;
    page2.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.page()).toBe(2);
    expect(page2.getAttribute('aria-current')).toBe('page');
  });

  it('clamps a bound page left out of range when total shrinks', async () => {
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    host.page.set(4);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Showing 31–40 of 42');

    // Filtering collapses the result set to one page while page is still 4.
    host.total.set(5);
    await fixture.whenStable();
    expect(el.textContent).toContain('Showing 1–5 of 5');
    const onlyPage = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '1',
    )!;
    expect(onlyPage.getAttribute('aria-current')).toBe('page');
    expect((el.querySelector('[aria-label="Previous page"]') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((el.querySelector('[aria-label="Next page"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
