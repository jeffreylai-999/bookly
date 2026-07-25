import { Component, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'ui-sidebar-nav-item',
  imports: [LucideAngularModule],
  template: `
    <button
      type="button"
      class="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border-0 px-3 py-2.5 text-left text-sm font-semibold focus-ring-dark"
      [class]="
        active()
          ? 'bg-white/10 text-white'
          : 'bg-transparent text-white/[0.68] hover:bg-white/[0.08]'
      "
      [attr.aria-current]="active() ? 'page' : null"
      (click)="activate.emit()"
    >
      <lucide-angular [name]="icon()" [size]="18" [strokeWidth]="1.75" />
      {{ label() }}
    </button>
  `,
  host: { class: 'block' },
})
export class UiSidebarNavItem {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly active = input(false);
  readonly activate = output<void>();
}
