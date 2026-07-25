import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiSegmented } from './segmented';

@Component({
  imports: [UiSegmented],
  template: `<ui-segmented [options]="opts" [(value)]="tab" groupLabel="Loan status" />`,
})
class Host {
  opts = [
    { label: 'Active', value: 'active' },
    { label: 'Overdue', value: 'overdue' },
    { label: 'Returned', value: 'returned' },
  ];
  tab = signal('active');
}

describe('UiSegmented', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  it('marks selected tab and switches on click', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const group = fixture.nativeElement.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.getAttribute('aria-label')).toBe('Loan status');
    const tabs = fixture.nativeElement.querySelectorAll('[role="radio"]') as NodeListOf<HTMLButtonElement>;
    expect(tabs[0].getAttribute('aria-checked')).toBe('true');
    tabs[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.tab()).toBe('overdue');
    expect(tabs[1].getAttribute('aria-checked')).toBe('true');
  });

  it('moves selection with arrow keys', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const list = fixture.nativeElement.querySelector('[role="radiogroup"]') as HTMLElement;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.tab()).toBe('overdue');
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.tab()).toBe('active');
  });
});
