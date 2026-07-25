import { Component, Service, inject, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
}

@Service()
export class ToastService {
  private nextId = 0;
  private readonly state = signal<Toast[]>([]);
  readonly toasts = this.state.asReadonly();

  show(message: string, duration = 2200): void {
    const id = this.nextId++;
    this.state.update((toasts) => [...toasts, { id, message }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number): void {
    this.state.update((toasts) => toasts.filter((t) => t.id !== id));
  }
}

@Component({
  selector: 'ui-toast-host',
  template: `
    <div class="pointer-events-none fixed bottom-7 right-7 z-50 flex flex-col gap-2" aria-live="polite">
      @for (t of toastService.toasts(); track t.id) {
        <div class="rounded-xl bg-ink-heading px-5 py-3.5 text-[13.5px] font-semibold text-white shadow-toast">
          {{ t.message }}
        </div>
      }
    </div>
  `,
})
export class UiToastHost {
  protected readonly toastService = inject(ToastService);
}
