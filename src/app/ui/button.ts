import { Directive, computed, input } from '@angular/core';

export type BtnVariant = 'primary' | 'outline' | 'pill' | 'pill-muted' | 'icon';

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 font-bold transition-colors duration-100 focus-ring disabled:pointer-events-none disabled:opacity-50';

/**
 * Fills and label text use `brand-dark`/`brand-strong`, not `brand`. Button
 * labels here are 12–14px bold, which WCAG does not count as large text, so
 * they need 4.5:1 — and both white-on-`brand` and `brand`-on-white land at
 * 3.23:1. `brand` stays correct for borders and other non-text UI (3:1).
 */
export const BTN_VARIANT_CLASSES: Record<BtnVariant, string> = {
  primary:
    'rounded-full border-0 bg-brand-dark px-5 py-[11px] text-sm text-white hover:bg-brand-strong',
  outline:
    'rounded-full border border-brand bg-surface px-5 py-[11px] text-sm text-brand-dark hover:bg-badge-cyan-bg',
  pill: 'rounded-full border border-brand bg-surface px-3 py-1.5 text-xs text-brand-dark hover:bg-badge-cyan-bg',
  'pill-muted':
    'rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft hover:bg-control-hover',
  icon: 'size-9 rounded-lg border border-line bg-transparent text-ink-soft hover:bg-control-hover',
};

@Directive({
  selector: 'button[uiBtn], a[uiBtn]',
  host: { '[class]': 'classes()' },
})
export class UiBtn {
  readonly variant = input<BtnVariant>('primary');
  protected readonly classes = computed(() => `${BASE} ${BTN_VARIANT_CLASSES[this.variant()]}`);
}
