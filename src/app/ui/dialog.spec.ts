import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LUCIDE_ICONS, LucideIconProvider, X } from 'lucide-angular';
import { UiDialog } from './dialog';

@Component({
  imports: [UiDialog],
  template: `
    <ui-dialog [(open)]="open" heading="Add title" subtitle="Catalog a new item">
      <p>form body</p>
      <button dialog-actions>Save</button>
    </ui-dialog>
  `,
})
class Host {
  open = signal(false);
}

describe('UiDialog', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ X }) }],
    }).compileComponents();
  });

  const render = async (): Promise<
    [ReturnType<typeof TestBed.createComponent<Host>>, HTMLDialogElement]
  > => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return [fixture, fixture.nativeElement.querySelector('dialog') as HTMLDialogElement];
  };

  it('does not force display:flex while closed, so the native dialog can hide', async () => {
    const [, dialog] = await render();
    expect(dialog.className.split(/\s+/)).not.toContain('flex');
    expect(dialog.className).toContain('open:flex');
    expect(dialog.open).toBe(false);
  });

  it('centers on the viewport so Tailwind preflight cannot pin it top-left', async () => {
    const [, dialog] = await render();
    expect(dialog.className).toContain('left-1/2');
    expect(dialog.className).toContain('top-1/2');
    expect(dialog.className).toContain('-translate-x-1/2');
    expect(dialog.className).toContain('-translate-y-1/2');
  });

  it('does not put the scrollbar on the dialog itself, so a focus ring cannot resize it', async () => {
    const [, dialog] = await render();
    expect(dialog.className).toContain('overflow-hidden');
    expect(dialog.className).toContain('max-h-[90vh]');
    expect(dialog.className).not.toContain('overflow-y-auto');
  });

  it('labels itself by its own heading', async () => {
    const [, dialog] = await render();
    const headingId = dialog.getAttribute('aria-labelledby');
    expect(headingId).toBeTruthy();
    expect(dialog.querySelector(`#${headingId}`)?.textContent?.trim()).toBe('Add title');
  });

  it('projects body and action content', async () => {
    const [, dialog] = await render();
    expect(dialog.textContent).toContain('form body');
    expect(dialog.textContent).toContain('Catalog a new item');
    expect(dialog.querySelector('[dialog-actions]')?.textContent).toBe('Save');
  });

  it('opens and closes as the model flips', async () => {
    const [fixture, dialog] = await render();
    expect(dialog.open).toBe(false);

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    expect(dialog.open).toBe(true);

    fixture.componentInstance.open.set(false);
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
  });

  it('writes back to the model when the close button is used', async () => {
    const [fixture, dialog] = await render();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    (dialog.querySelector('button[aria-label="Close dialog"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('writes back to the model when the platform closes it, so Escape cannot desync it', async () => {
    const [fixture, dialog] = await render();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    // What Escape triggers natively.
    dialog.dispatchEvent(new Event('cancel'));
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
  });
});
