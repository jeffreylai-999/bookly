import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LUCIDE_ICONS, LucideIconProvider, ChevronLeft, ChevronRight } from 'lucide-angular';
import { UiPagination, pageCount, pageRange } from './pagination';

@Component({
  imports: [UiPagination],
  template: `<ui-pagination [(page)]="page" [pageSize]="10" [total]="42" />`,
})
class Host {
  page = signal(1);
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
});
