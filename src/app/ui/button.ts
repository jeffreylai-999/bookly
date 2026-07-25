import { Directive, computed, input } from '@angular/core';

export type BtnVariant = 'primary' | 'outline' | 'pill' | 'pill-muted' | 'icon';

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 font-bold focus-ring disabled:pointer-events-none disabled:opacity-50';

export const BTN_VARIANT_CLASSES: Record<BtnVariant, string> = {
  primary: 'rounded-full border-0 bg-brand px-5 py-[11px] text-sm text-white hover:bg-brand-dark',
  outline:
    'rounded-full border border-brand bg-surface px-5 py-[11px] text-sm text-brand hover:bg-badge-cyan-bg',
  pill: 'rounded-full border border-brand bg-surface px-3 py-1.5 text-xs text-brand hover:bg-badge-cyan-bg',
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
