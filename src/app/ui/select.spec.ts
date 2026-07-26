import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SelectOption, UiSelect } from './select';

@Component({
  imports: [UiSelect],
  template: `<ui-select
    [options]="options"
    [(value)]="picked"
    [placeholder]="placeholder()"
    ariaLabel="Status filter"
  />`,
})
class Host {
  options: SelectOption[] = [
    { label: 'All statuses', value: 'all' },
    { label: 'Overdue', value: 'overdue' },
  ];
  picked = signal('');
  placeholder = signal<string | undefined>('Choose a status');
}

describe('UiSelect', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  const render = async (): Promise<
    [ReturnType<typeof TestBed.createComponent<Host>>, HTMLSelectElement]
  > => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return [fixture, fixture.nativeElement.querySelector('select') as HTMLSelectElement];
  };

  it('renders the options and names the control', async () => {
    const [, select] = await render();
    expect(select.getAttribute('aria-label')).toBe('Status filter');
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual([
      'Choose a status',
      'All statuses',
      'Overdue',
    ]);
  });

  it('makes the placeholder unpickable so it cannot be submitted as a value', async () => {
    const [, select] = await render();
    expect(select.options[0].disabled).toBe(true);
  });

  it('omits the placeholder row entirely when none is given', async () => {
    const [fixture, select] = await render();
    fixture.componentInstance.placeholder.set(undefined);
    await fixture.whenStable();
    expect(select.options.length).toBe(2);
  });

  it('writes the chosen value back to the model', async () => {
    const [fixture, select] = await render();
    select.value = 'overdue';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.picked()).toBe('overdue');
  });
});
