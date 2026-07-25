import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiBadge, BADGE_TONE_CLASSES } from './badge';

@Component({
  imports: [UiBadge],
  template: `<span uiBadge [tone]="'success'">Available</span>`,
})
class Host {}

describe('UiBadge', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  it('applies tone palette and pill shape', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('span') as HTMLElement;
    expect(el.className).toContain('bg-badge-green-bg');
    expect(el.className).toContain('text-badge-green-text');
    expect(el.className).toContain('rounded-full');
  });

  it('has a class map entry for every tone', () => {
    expect(Object.keys(BADGE_TONE_CLASSES).sort()).toEqual(
      ['danger', 'info', 'neutral', 'pink', 'purple', 'success', 'warning'].sort(),
    );
  });
});
