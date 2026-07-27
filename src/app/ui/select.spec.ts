import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SelectOption, UiSelect } from './select';

@Component({
  imports: [UiSelect],
  template: `<ui-select
    [options]="options()"
    [(value)]="picked"
    [placeholder]="placeholder()"
    ariaLabel="Status filter"
  />`,
})
class Host {
  options = signal<SelectOption[]>([
    { label: 'All statuses', value: 'all' },
    { label: 'Overdue', value: 'overdue' },
  ]);
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

  describe('with no placeholder', () => {
    /**
     * A native select always has something selected. With no placeholder row
     * there is no option matching the default empty value, so the browser
     * displays the first option while the model still reads '' — the consumer
     * filters on '' for a control the user sees as set to "All statuses".
     */
    it('adopts the first option when the value matches no option', async () => {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.placeholder.set(undefined);
      await fixture.whenStable();
      const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

      expect(fixture.componentInstance.picked()).toBe('all');
      expect(select.selectedIndex).toBe(0);
      expect(select.value).toBe('all');
    });

    it('leaves a value that does match an option alone', async () => {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.placeholder.set(undefined);
      fixture.componentInstance.picked.set('overdue');
      await fixture.whenStable();

      expect(fixture.componentInstance.picked()).toBe('overdue');
      expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement).value).toBe(
        'overdue',
      );
    });

    it('re-adopts when the option list changes under a now-stale value', async () => {
      const fixture = TestBed.createComponent(Host);
      const host = fixture.componentInstance;
      host.placeholder.set(undefined);
      host.picked.set('overdue');
      await fixture.whenStable();
      expect(host.picked()).toBe('overdue');

      host.options.set([{ label: 'Fiction', value: 'fiction' }]);
      await fixture.whenStable();
      expect(host.picked()).toBe('fiction');
    });
  });

  it('keeps an unmatched value when a placeholder exists to represent it', async () => {
    // The placeholder is the matching option, so '' is a legitimate state here.
    const [fixture, select] = await render();
    expect(fixture.componentInstance.picked()).toBe('');
    expect(select.value).toBe('');
  });
});
