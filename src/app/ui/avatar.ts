import { Component, computed, input } from '@angular/core';

const AVATAR_COLORS = [
  'bg-brand',
  'bg-accent-pink',
  'bg-chart-purple',
  'bg-chart-cyan',
  'bg-chart-amber',
  'bg-ink-heading',
];

export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColorIndex(name: string, paletteSize: number): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % paletteSize;
}

@Component({
  selector: 'ui-avatar',
  template: `{{ initials() }}`,
  host: {
    '[class]': 'hostClasses()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.fontSize.px]': 'size() < 36 ? 12 : 13',
    'aria-hidden': 'true',
  },
})
export class UiAvatar {
  readonly name = input.required<string>();
  readonly size = input(36);
  protected readonly initials = computed(() => avatarInitials(this.name()));
  protected readonly hostClasses = computed(
    () =>
      `inline-flex select-none items-center justify-center rounded-full font-bold text-white ${AVATAR_COLORS[avatarColorIndex(this.name(), AVATAR_COLORS.length)]}`,
  );
}
