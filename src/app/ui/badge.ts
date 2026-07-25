import { Directive, computed, input } from '@angular/core';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'pink' | 'purple';

export const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-badge-green-bg text-badge-green-text',
  warning: 'bg-badge-amber-bg text-badge-amber-text',
  danger: 'bg-badge-red-bg text-badge-red-text',
  info: 'bg-badge-cyan-bg text-badge-cyan-text',
  neutral: 'bg-badge-neutral-bg text-badge-neutral-text',
  pink: 'bg-badge-pink-bg text-badge-pink-text',
  purple: 'bg-badge-purple-bg text-badge-purple-text',
};

@Directive({
  selector: '[uiBadge]',
  host: { '[class]': 'classes()' },
})
export class UiBadge {
  readonly tone = input<BadgeTone>('neutral');
  protected readonly classes = computed(
    () =>
      `inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${BADGE_TONE_CLASSES[this.tone()]}`,
  );
}
