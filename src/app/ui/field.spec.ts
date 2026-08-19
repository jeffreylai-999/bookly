import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiField } from './field';

@Component({
  imports: [UiField],
  template: `
    <ui-field label="Title" [hint]="hint()" [error]="error()" [required]="required()" #f>
      <input [id]="f.controlId" [attr.aria-describedby]="f.describedBy()" />
    </ui-field>
  `,
})
class Host {
  hint = signal<string | undefined>('As printed on the spine');
  error = signal<string | undefined>(undefined);
  required = signal(false);
}

describe('UiField', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  const render = async (): Promise<
    [ReturnType<typeof TestBed.createComponent<Host>>, HTMLElement]
  > => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return [fixture, fixture.nativeElement as HTMLElement];
  };

  it('binds the label to the projected control', async () => {
    const [, el] = await render();
    const label = el.querySelector('label') as HTMLLabelElement;
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.id).toBeTruthy();
    expect(label.getAttribute('for')).toBe(input.id);
  });

  it('describes the control with the hint', async () => {
    const [, el] = await render();
    const input = el.querySelector('input') as HTMLInputElement;
    const hint = el.querySelector('p') as HTMLElement;
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(hint.textContent?.trim()).toBe('As printed on the spine');
  });

  it('swaps the hint for the error so only one message is announced', async () => {
    const [fixture, el] = await render();
    fixture.componentInstance.error.set('Title is required');
    await fixture.whenStable();

    const messages = el.querySelectorAll('p');
    expect(messages.length).toBe(1);
    expect(messages[0].getAttribute('role')).toBe('alert');
    expect(messages[0].textContent?.trim()).toBe('Title is required');
    expect((el.querySelector('input') as HTMLInputElement).getAttribute('aria-describedby')).toBe(
      messages[0].id,
    );
  });

  it('reserves a one-line message slot so an error does not grow the layout', async () => {
    const [fixture, el] = await render();
    fixture.componentInstance.hint.set(undefined);
    await fixture.whenStable();

    const slot = el.querySelector('.min-h-3') as HTMLElement;
    expect(slot).toBeTruthy();
    expect(slot.querySelector('p')).toBeNull();

    fixture.componentInstance.error.set('Title is required');
    await fixture.whenStable();
    expect(el.querySelectorAll('.min-h-3').length).toBe(1);
    expect(slot.querySelector('p')?.textContent?.trim()).toBe('Title is required');
  });

  it('leaves aria-describedby off entirely when there is nothing to describe', async () => {
    const [fixture, el] = await render();
    fixture.componentInstance.hint.set(undefined);
    await fixture.whenStable();
    expect(el.querySelector('input')?.getAttribute('aria-describedby')).toBeNull();
  });

  it('marks the required asterisk decorative rather than reading it out', async () => {
    const [fixture, el] = await render();
    fixture.componentInstance.required.set(true);
    await fixture.whenStable();
    expect(el.querySelector('label span')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('mints unique ids so two fields on one page do not collide', async () => {
    const [, first] = await render();
    const [, second] = await render();
    expect(first.querySelector('input')?.id).not.toBe(second.querySelector('input')?.id);
  });
});
