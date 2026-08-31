import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

export interface SelectOption {
  label: string;
  value: string;
}

let nextSelectId = 0;

/**
 * Combobox + custom listbox panel. Native `<select>` cannot be restyled, so the
 * menu is a fixed, shadowed panel. When the Popover API exists it is promoted
 * to the top layer so a dialog's overflow cannot clip it.
 */
@Component({
  selector: 'ui-select',
  template: `
    <button
      #trigger
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      class="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface py-0 pl-3.5 pr-3 text-left text-sm text-ink transition-colors duration-100 focus-ring focus:border-brand disabled:cursor-default disabled:text-disabled"
      [class.border-brand]="open()"
      [id]="controlId() ?? null"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      [attr.aria-activedescendant]="open() ? optionId(highlighted()) : null"
      [attr.aria-label]="ariaLabel() ?? null"
      [attr.aria-describedby]="describedBy() ?? null"
      [attr.aria-invalid]="invalid() ? true : null"
      [disabled]="disabled()"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
    >
      <span class="min-w-0 flex-1 truncate" [class.text-ink-muted]="!selectedLabel()">
        {{ selectedLabel() || placeholder() || '' }}
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        class="size-4 shrink-0 text-ink-muted transition-transform duration-200"
        [class.rotate-180]="open()"
      >
        <path
          d="m6 9 6 6 6-6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    @if (open()) {
      <ul
        #panel
        role="listbox"
        [id]="listId"
        [attr.popover]="canPopover ? 'manual' : null"
        [attr.aria-label]="ariaLabel() ?? null"
        class="fixed z-50 m-0 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-toast select-panel-in motion-reduce:animate-none"
        [style.top.px]="panelTop()"
        [style.left.px]="panelLeft()"
        [style.width.px]="panelWidth()"
      >
        @for (opt of options(); track opt.value; let i = $index) {
          <li
            role="option"
            class="cursor-pointer rounded-md px-3 py-2 text-sm transition-colors duration-100"
            [id]="optionId(i)"
            [attr.aria-selected]="opt.value === value()"
            [class.bg-badge-cyan-bg]="opt.value === value()"
            [class.font-semibold]="opt.value === value()"
            [class.text-brand-dark]="opt.value === value()"
            [class.bg-control]="highlighted() === i && opt.value !== value()"
            (click)="pick(opt.value)"
            (mouseenter)="highlighted.set(i)"
          >
            {{ opt.label }}
          </li>
        }
      </ul>
    }
  `,
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class UiSelect {
  readonly options = input.required<SelectOption[]>();
  readonly value = model('');
  readonly placeholder = input<string>();
  readonly ariaLabel = input<string>();
  readonly controlId = input<string>();
  readonly describedBy = input<string | null>(null);
  readonly disabled = input(false);
  readonly invalid = input(false);

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly triggerRef = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly open = signal(false);
  protected readonly highlighted = signal(0);
  protected readonly panelTop = signal(0);
  protected readonly panelLeft = signal(0);
  protected readonly panelWidth = signal(0);

  protected readonly listId = `ui-select-${nextSelectId++}-list`;
  protected readonly canPopover =
    typeof HTMLElement !== 'undefined' &&
    typeof HTMLElement.prototype.showPopover === 'function';

  protected readonly matched = computed(() => this.options().some((o) => o.value === this.value()));
  protected readonly selectedLabel = computed(
    () => this.options().find((o) => o.value === this.value())?.label,
  );

  private typeBuffer = '';
  private typeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const opts = this.options();
      if (this.placeholder() !== undefined || this.matched() || opts.length === 0) return;
      this.value.set(opts[0].value);
    });

    afterRenderEffect(() => {
      if (!this.open()) return;
      const panel = this.panelRef()?.nativeElement;
      if (!panel) return;
      if (typeof panel.showPopover === 'function' && !panel.matches(':popover-open')) {
        panel.showPopover();
      }
      this.positionPanel();
    });

    const onReposition = () => {
      if (this.open()) this.positionPanel();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('scroll', onReposition, true);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onReposition);
    }
    this.destroyRef.onDestroy(() => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('scroll', onReposition, true);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onReposition);
      }
      this.clearTypeBuffer();
    });
  }

  protected optionId(index: number): string {
    return `${this.listId}-opt-${index}`;
  }

  protected toggle(): void {
    if (this.disabled()) return;
    if (this.open()) {
      this.close();
      return;
    }
    this.openPanel();
  }

  protected close(): void {
    if (!this.open()) return;
    const panel = this.panelRef()?.nativeElement;
    if (panel && typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) {
      panel.hidePopover();
    }
    this.open.set(false);
  }

  protected pick(value: string): void {
    this.value.set(value);
    this.close();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target;
    if (!(target instanceof Node) || !this.elementRef.nativeElement.contains(target)) {
      this.close();
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const opts = this.options();
    if (opts.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.openPanel();
          return;
        }
        this.moveHighlight(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.open()) {
          this.openPanel();
          return;
        }
        this.moveHighlight(-1);
        return;
      case 'Home':
        if (!this.open()) return;
        event.preventDefault();
        this.highlighted.set(0);
        return;
      case 'End':
        if (!this.open()) return;
        event.preventDefault();
        this.highlighted.set(opts.length - 1);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!this.open()) {
          this.openPanel();
          return;
        }
        this.pick(opts[this.highlighted()]?.value ?? opts[0].value);
        return;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.close();
        }
        return;
      case 'Tab':
        this.close();
        return;
      default: {
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          this.typeAhead(event.key);
        }
      }
    }
  }

  private openPanel(): void {
    const opts = this.options();
    const selected = opts.findIndex((o) => o.value === this.value());
    this.highlighted.set(selected >= 0 ? selected : 0);
    this.open.set(true);
  }

  private moveHighlight(delta: number): void {
    const last = this.options().length - 1;
    if (last < 0) return;
    const next = this.highlighted() + delta;
    this.highlighted.set(Math.min(last, Math.max(0, next)));
  }

  private typeAhead(char: string): void {
    this.typeBuffer += char.toLowerCase();
    if (this.typeTimer) clearTimeout(this.typeTimer);
    this.typeTimer = setTimeout(() => this.clearTypeBuffer(), 400);
    const index = this.options().findIndex((o) => o.label.toLowerCase().startsWith(this.typeBuffer));
    if (index < 0) return;
    this.highlighted.set(index);
    if (!this.open()) this.openPanel();
  }

  private clearTypeBuffer(): void {
    this.typeBuffer = '';
    if (this.typeTimer) {
      clearTimeout(this.typeTimer);
      this.typeTimer = null;
    }
  }

  private positionPanel(): void {
    const trigger = this.triggerRef().nativeElement;
    const rect = trigger.getBoundingClientRect();
    const panel = this.panelRef()?.nativeElement;
    const gap = 4;
    const height = panel?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = height > 0 && spaceBelow < height && rect.top > spaceBelow;
    this.panelTop.set(openUp ? rect.top - height - gap : rect.bottom + gap);
    this.panelLeft.set(rect.left);
    this.panelWidth.set(rect.width);
  }
}
