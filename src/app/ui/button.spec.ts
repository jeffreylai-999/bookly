import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiBtn, BTN_VARIANT_CLASSES } from './button';

@Component({
  imports: [UiBtn],
  template: `<button uiBtn [variant]="'outline'" class="w-full">Go</button>`,
})
class Host {}

describe('UiBtn', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  it('applies variant classes and keeps consumer classes', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.className).toContain('border-brand');
    expect(btn.className).toContain('focus-ring');
    expect(btn.className).toContain('w-full');
  });

  it('has a class map entry for every variant', () => {
    expect(Object.keys(BTN_VARIANT_CLASSES).sort()).toEqual(
      ['icon', 'outline', 'pill', 'pill-muted', 'primary'].sort(),
    );
  });
});
