import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LUCIDE_ICONS, LucideIconProvider, Clock } from 'lucide-angular';
import { UiListItem } from './list-item';
import { UiEmptyState } from './empty-state';

@Component({
  imports: [UiListItem],
  template: `<ui-list-item icon="clock" iconTone="warning" title="1984" meta="Due tomorrow"><span>3 days</span></ui-list-item>`,
})
class Host {}

@Component({
  imports: [UiEmptyState],
  template: `<ui-empty-state headline="Nothing overdue — nice." message="All clear." />`,
})
class EmptyHost {}

describe('UiListItem', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host, EmptyHost],
      providers: [{ provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Clock }) }],
    }).compileComponents();
  });

  it('renders chip tone, title, meta and right slot', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const chip = el.querySelector('[data-testid="list-chip"]') as HTMLElement;
    expect(chip.className).toContain('bg-badge-amber-bg');
    expect(el.textContent).toContain('1984');
    expect(el.textContent).toContain('Due tomorrow');
    expect(el.textContent).toContain('3 days');
  });

  it('renders empty state', async () => {
    const fixture = TestBed.createComponent(EmptyHost);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nothing overdue');
  });
});
