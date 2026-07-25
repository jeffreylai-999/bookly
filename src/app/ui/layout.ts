import { Component } from '@angular/core';

@Component({
  selector: 'ui-layout',
  template: `
    <aside class="flex w-[260px] shrink-0 flex-col bg-ink-heading px-4 py-6">
      <ng-content select="[layout-sidebar]" />
    </aside>
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <ng-content select="ui-topbar" />
      <main class="flex-1 overflow-y-auto p-8">
        <ng-content />
      </main>
    </div>
  `,
  host: { class: 'flex h-dvh w-full overflow-hidden bg-canvas text-ink' },
})
export class UiLayout {}
