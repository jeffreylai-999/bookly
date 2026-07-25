import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LUCIDE_ICONS, LucideIconProvider, Search } from 'lucide-angular';
import { vi } from 'vitest';
import { UiSearchInput } from './search-input';

@Component({
  imports: [UiSearchInput],
  template: `<ui-search-input [(value)]="q" (debouncedChange)="last = $event" placeholder="Search titles" />`,
})
class Host {
  q = signal('');
  last = '';
}

describe('UiSearchInput', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Search }) }],
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  it('updates model immediately and debounces change output', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const inp = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    inp.value = 'dune';
    inp.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.q()).toBe('dune');
    expect(fixture.componentInstance.last).toBe('');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(fixture.componentInstance.last).toBe('dune');
  });
});
