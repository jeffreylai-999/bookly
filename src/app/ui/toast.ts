import { Component, Service, inject, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

export type ToastTone = 'default' | 'danger';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/** How long a confirmation stays up. Errors default to no timeout — see `error`. */
const DEFAULT_DURATION_MS = 2200;

@Service()
export class ToastService {
  private nextId = 0;
  private readonly state = signal<Toast[]>([]);
  readonly toasts = this.state.asReadonly();

  show(message: string, duration = DEFAULT_DURATION_MS): void {
    this.push(message, 'default', duration);
  }

  /** Persists by default: a 2.2s error is an error nobody read. Pass a duration to time it out. */
  error(message: string, duration = 0): void {
    this.push(message, 'danger', duration);
  }

  dismiss(id: number): void {
    this.state.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  private push(message: string, tone: ToastTone, duration: number): void {
    const id = this.nextId++;
    this.state.update((toasts) => [...toasts, { id, message, tone }]);
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
  }
}

@Component({
  selector: 'ui-toast-host',
  imports: [LucideAngularModule],
  template: `
    <!--
      The container is pointer-events-none so it never blocks the page beneath,
      but each toast re-enables them — otherwise a toast that outlives its timer
      (an error) can never be dismissed. Errors are assertive so they interrupt.
    -->
    <div class="pointer-events-none fixed bottom-7 right-7 z-50 flex flex-col gap-2">
      <div aria-live="polite" role="status" class="flex flex-col gap-2">
        @for (t of defaultToasts(); track t.id) {
          <div
            class="pointer-events-auto flex items-center gap-3 rounded-xl bg-ink-heading px-5 py-3.5 text-[13.5px] font-semibold text-white shadow-toast"
          >
            {{ t.message }}
            <button
              type="button"
              class="-mr-2 flex size-6 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-white/[0.68] transition-colors duration-100 hover:bg-white/[0.12] hover:text-white focus-ring-dark"
              [attr.aria-label]="dismissLabel()"
              (click)="toastService.dismiss(t.id)"
            >
              <lucide-angular name="x" [size]="14" [strokeWidth]="2" />
            </button>
          </div>
        }
      </div>
      <div aria-live="assertive" role="alert" class="flex flex-col gap-2">
        @for (t of errorToasts(); track t.id) {
          <div
            class="pointer-events-auto flex items-center gap-3 rounded-xl bg-danger px-5 py-3.5 text-[13.5px] font-semibold text-white shadow-toast"
          >
            {{ t.message }}
            <button
              type="button"
              class="-mr-2 flex size-6 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-white/[0.68] transition-colors duration-100 hover:bg-white/[0.12] hover:text-white focus-ring-dark"
              [attr.aria-label]="dismissLabel()"
              (click)="toastService.dismiss(t.id)"
            >
              <lucide-angular name="x" [size]="14" [strokeWidth]="2" />
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class UiToastHost {
  // i18n-agnostic per ADR-0004: consumers pass translated strings.
  readonly dismissLabel = input('Dismiss notification');
  protected readonly toastService = inject(ToastService);

  protected defaultToasts(): Toast[] {
    return this.toastService.toasts().filter((t) => t.tone === 'default');
  }

  protected errorToasts(): Toast[] {
    return this.toastService.toasts().filter((t) => t.tone === 'danger');
  }
}
