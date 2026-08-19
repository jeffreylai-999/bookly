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

  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      trigger: root.querySelector('[role="combobox"]') as HTMLButtonElement,
      root,
    };
  };

  it('renders the combobox and names the control', async () => {
    const { trigger } = await render();
    expect(trigger.getAttribute('aria-label')).toBe('Status filter');
    expect(trigger.textContent).toContain('Choose a status');
  });

  it('opens a shadowed panel of options, without a pickable placeholder', async () => {
    const { trigger, root, fixture } = await render();
    trigger.click();
    await fixture.whenStable();

    const list = root.querySelector('[role="listbox"]') as HTMLElement;
    expect(list).toBeTruthy();
    expect(list.className).toContain('shadow-toast');
    expect(list.className).toContain('select-panel-in');
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim())).toEqual([
      'All statuses',
      'Overdue',
    ]);
  });

  it('omits the placeholder row entirely when none is given', async () => {
    const { fixture, trigger, root } = await render();
    fixture.componentInstance.placeholder.set(undefined);
    await fixture.whenStable();
    trigger.click();
    await fixture.whenStable();
    expect(root.querySelectorAll('[role="option"]').length).toBe(2);
  });

  it('writes the chosen value back to the model', async () => {
    const { fixture, trigger, root } = await render();
    trigger.click();
    await fixture.whenStable();
    const overdue = [...root.querySelectorAll('[role="option"]')].find((o) =>
      o.textContent?.includes('Overdue'),
    ) as HTMLElement;
    overdue.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.picked()).toBe('overdue');
    expect(root.querySelector('[role="listbox"]')).toBeNull();
  });

  describe('with no placeholder', () => {
    it('adopts the first option when the value matches no option', async () => {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.placeholder.set(undefined);
      await fixture.whenStable();
      const trigger = (fixture.nativeElement as HTMLElement).querySelector(
        '[role="combobox"]',
      ) as HTMLButtonElement;

      expect(fixture.componentInstance.picked()).toBe('all');
      expect(trigger.textContent).toContain('All statuses');
    });

    it('leaves a value that does match an option alone', async () => {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.placeholder.set(undefined);
      fixture.componentInstance.picked.set('overdue');
      await fixture.whenStable();

      expect(fixture.componentInstance.picked()).toBe('overdue');
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[role="combobox"]')?.textContent,
      ).toContain('Overdue');
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
    const { fixture, trigger } = await render();
    expect(fixture.componentInstance.picked()).toBe('');
    expect(trigger.textContent).toContain('Choose a status');
  });

  it('closes the panel on Escape', async () => {
    const { trigger, root, fixture } = await render();
    trigger.click();
    await fixture.whenStable();
    expect(root.querySelector('[role="listbox"]')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(root.querySelector('[role="listbox"]')).toBeNull();
  });

  it('destroys without throwing after scroll listeners are attached', async () => {
    const { fixture } = await render();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
