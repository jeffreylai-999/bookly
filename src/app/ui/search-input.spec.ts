import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LUCIDE_ICONS, LucideIconProvider, ScanBarcode, Search } from 'lucide-angular';
import { vi } from 'vitest';
import { UiSearchInput } from './search-input';

@Component({
  imports: [UiSearchInput],
  template: `<ui-search-input
    [(value)]="q"
    [scan]="scan()"
    (debouncedChange)="last = $event"
    (submitted)="scans.push($event)"
    placeholder="Search titles"
  />`,
})
class Host {
  q = signal('');
  scan = signal(false);
  last = '';
  scans: string[] = [];
}

const type = (fixture: ReturnType<typeof TestBed.createComponent<Host>>, text: string): void => {
  const inp = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  inp.value = text;
  inp.dispatchEvent(new Event('input'));
  fixture.detectChanges();
};

const pressEnter = (fixture: ReturnType<typeof TestBed.createComponent<Host>>): void => {
  const inp = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  fixture.detectChanges();
};

describe('UiSearchInput', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ Search, ScanBarcode }),
        },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  it('updates model immediately and debounces change output', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    type(fixture, 'dune');
    expect(fixture.componentInstance.q()).toBe('dune');
    expect(fixture.componentInstance.last).toBe('');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(fixture.componentInstance.last).toBe('dune');
  });

  it('submits on Enter and cancels the pending debounce so it does not fire twice', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    type(fixture, 'dune');
    pressEnter(fixture);
    expect(fixture.componentInstance.scans).toEqual(['dune']);

    vi.advanceTimersByTime(500);
    fixture.detectChanges();
    expect(fixture.componentInstance.last).toBe('');
  });

  it('ignores Enter on an empty field', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    pressEnter(fixture);
    expect(fixture.componentInstance.scans).toEqual([]);
  });

  describe('scan mode', () => {
    it('never debounces, so a fast second scan cannot cancel the first', async () => {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.scan.set(true);
      fixture.detectChanges();
      await fixture.whenStable();

      type(fixture, '9780441013593');
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
      expect(fixture.componentInstance.last).toBe('');
    });

    it('emits each scan and clears the field ready for the next one', async () => {
      const fixture = TestBed.createComponent(Host);
      const host = fixture.componentInstance;
      host.scan.set(true);
      fixture.detectChanges();
      await fixture.whenStable();

      type(fixture, '9780441013593');
      pressEnter(fixture);
      expect(host.scans).toEqual(['9780441013593']);
      expect(host.q()).toBe('');
      expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('');

      type(fixture, '9780553380958');
      pressEnter(fixture);
      expect(host.scans).toEqual(['9780441013593', '9780553380958']);
    });

    it('keeps the field after submit in normal search mode', async () => {
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      await fixture.whenStable();
      type(fixture, 'dune');
      pressEnter(fixture);
      expect(fixture.componentInstance.q()).toBe('dune');
    });
  });
});
