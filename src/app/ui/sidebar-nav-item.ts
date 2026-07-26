import { Component, computed, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

const SHARED =
  'flex w-full cursor-pointer items-center gap-3 rounded-[10px] border-0 px-3 py-2.5 text-left text-sm font-semibold transition-colors duration-100 focus-ring-dark';
const ACTIVE = 'bg-white/10 text-white';
const INACTIVE = 'bg-transparent text-white/[0.68] hover:bg-white/[0.08]';

/**
 * Renders an anchor when given a `link`, and a button otherwise.
 *
 * Navigation is an anchor because a dashboard is a place people keep tabs open
 * in: middle-click, ctrl-click, "copy link address", and the hover status bar
 * all follow from the element being a real link, and none of them can be
 * recovered from a click handler on a button. The button branch stays for the
 * cases that genuinely aren't navigation — a demo, or an item that toggles a
 * panel — and those set `active` themselves.
 */
@Component({
  selector: 'ui-sidebar-nav-item',
  imports: [LucideAngularModule, RouterLink, RouterLinkActive],
  template: `
    @if (link(); as target) {
      <a
        [routerLink]="target"
        routerLinkActive
        #rla="routerLinkActive"
        [routerLinkActiveOptions]="{ exact: exact() }"
        [class]="rla.isActive ? activeClasses : inactiveClasses"
        [attr.aria-current]="rla.isActive ? 'page' : null"
      >
        <lucide-angular [name]="icon()" [size]="18" [strokeWidth]="1.75" />
        {{ label() }}
      </a>
    } @else {
      <button
        type="button"
        [class]="buttonClasses()"
        [attr.aria-current]="active() ? 'page' : null"
        (click)="activate.emit()"
      >
        <lucide-angular [name]="icon()" [size]="18" [strokeWidth]="1.75" />
        {{ label() }}
      </button>
    }
  `,
  host: { class: 'block' },
})
export class UiSidebarNavItem {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  /** A router commands array or path. Present means this item renders as a link. */
  readonly link = input<string | unknown[]>();
  readonly exact = input(false);
  /** Only consulted on the button branch; the anchor derives active from the router. */
  readonly active = input(false);
  readonly activate = output<void>();
  protected readonly activeClasses = `${SHARED} ${ACTIVE}`;
  protected readonly inactiveClasses = `${SHARED} ${INACTIVE}`;
  protected readonly buttonClasses = computed(() =>
    this.active() ? this.activeClasses : this.inactiveClasses,
  );
}
