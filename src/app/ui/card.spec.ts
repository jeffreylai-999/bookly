import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiCard } from './card';

@Component({
  imports: [UiCard],
  template: `<ui-card title="Overdue" subtitle="Top 5"><p>body</p></ui-card>`,
})
class Host {}

describe('UiCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  it('renders title, subtitle and projected content', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h3')?.textContent).toContain('Overdue');
    expect(el.textContent).toContain('Top 5');
    expect(el.querySelector('p')?.textContent).toBe('body');
    expect(el.querySelector('ui-card')?.className).toContain('rounded-card');
  });
});
