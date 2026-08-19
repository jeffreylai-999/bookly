import { Component, Service, inject, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

export type ToastType = 'primary' | 'success' | 'warning' | 'info' | 'error';

export interface Toast {
  id: number;
  type: ToastType;
  title?: string;
  details: string;
}

/** How long a confirmation stays up. Errors default to no timeout — see `error`. */
const DEFAULT_DURATION_MS = 2200;

const DEFAULT_TITLES: Record<ToastType, string> = {
  primary: 'Notice',
  success: 'Success',
  warning: 'Warning',
  info: 'Info',
  error: 'Error',
};

@Service()
export class ToastService {
  private nextId = 0;
  private readonly state = signal<Toast[]>([]);
  readonly toasts = this.state.asReadonly();

  /** Success confirmation. Auto-dismisses. */
  show(details: string, duration = DEFAULT_DURATION_MS): void {
    this.push('success', details, duration);
  }

  primary(details: string, duration = DEFAULT_DURATION_MS): void {
    this.push('primary', details, duration);
  }

  success(details: string, duration = DEFAULT_DURATION_MS): void {
    this.push('success', details, duration);
  }

  warning(details: string, duration = DEFAULT_DURATION_MS): void {
    this.push('warning', details, duration);
  }

  info(details: string, duration = DEFAULT_DURATION_MS): void {
    this.push('info', details, duration);
  }

  /** Persists by default: a 2.2s error is an error nobody read. Pass a duration to time it out. */
  error(details: string, duration = 0): void {
    this.push('error', details, duration);
  }

  dismiss(id: number): void {
    this.state.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  private push(type: ToastType, details: string, duration: number): void {
    const id = this.nextId++;
    this.state.update((toasts) => [...toasts, { id, type, details }]);
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
      @for (t of toastService.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex w-[22rem] max-w-[min(22rem,calc(100vw-2.5rem))] items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-toast toast-in motion-reduce:animate-none"
          [attr.role]="t.type === 'error' ? 'alert' : 'status'"
          [attr.aria-live]="t.type === 'error' ? 'assertive' : 'polite'"
        >
          <span
            [class]="
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ' +
              chipClass(t.type)
            "
          >
            <lucide-angular
              [name]="iconName(t.type)"
              [size]="14"
              [strokeWidth]="2.25"
              aria-hidden="true"
            />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-bold text-ink-heading">{{ titleFor(t) }}</p>
              <button
                type="button"
                class="-mr-1.5 -mt-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-ink-muted transition-colors duration-100 hover:bg-control-hover hover:text-ink-soft focus-ring"
                [attr.aria-label]="dismissLabel()"
                (click)="toastService.dismiss(t.id)"
              >
                <lucide-angular name="x" [size]="14" [strokeWidth]="2" />
              </button>
            </div>
            <p class="mt-0.5 text-[13px] leading-snug text-ink-muted">{{ t.details }}</p>
          </div>
        </div>
      }
    </div>
  `,
})
export class UiToastHost {
  // i18n-agnostic per ADR-0004: consumers pass translated strings.
  readonly dismissLabel = input('Dismiss notification');
  readonly titles = input<Partial<Record<ToastType, string>>>({});
  protected readonly toastService = inject(ToastService);

  protected titleFor(toast: Toast): string {
    return toast.title ?? this.titles()[toast.type] ?? DEFAULT_TITLES[toast.type];
  }

  protected iconName(type: ToastType): string {
    switch (type) {
      case 'primary':
        return 'info';
      case 'success':
        return 'check';
      case 'warning':
        return 'triangle-alert';
      case 'info':
        return 'info';
      case 'error':
        return 'alert-circle';
      default: {
        const _exhaustive: never = type;
        return _exhaustive;
      }
    }
  }

  protected chipClass(type: ToastType): string {
    switch (type) {
      case 'primary':
        return 'bg-brand-dark text-white';
      case 'success':
        return 'bg-success text-white';
      case 'warning':
        return 'bg-warning text-white';
      case 'info':
        return 'bg-ink-heading text-white';
      case 'error':
        return 'bg-danger text-white';
      default: {
        const _exhaustive: never = type;
        return _exhaustive;
      }
    }
  }
}
