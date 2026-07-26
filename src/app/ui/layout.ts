import { Component, input } from '@angular/core';

@Component({
  selector: 'ui-layout',
  template: `
    <!--
      First focusable element in the document, so a keyboard user reaches it
      before the eight-item sidebar they would otherwise tab through on every
      page. The negative tabindex on main is what lets the fragment actually
      move focus rather than only scrolling.
    -->
    <a
      [href]="'#' + mainId()"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-brand-dark focus:shadow-toast focus-ring"
    >
      {{ skipLabel() }}
    </a>
    <aside class="flex w-[260px] shrink-0 flex-col bg-ink-heading px-4 py-6">
      <ng-content select="[layout-sidebar]" />
    </aside>
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <ng-content select="ui-topbar" />
      <main [id]="mainId()" tabindex="-1" class="flex-1 overflow-y-auto p-8 focus:outline-none">
        <ng-content />
      </main>
    </div>
  `,
  host: { class: 'relative flex h-dvh w-full overflow-hidden bg-canvas text-ink' },
})
export class UiLayout {
  readonly mainId = input('main-content');
  // i18n-agnostic per ADR-0004: consumers pass translated strings.
  readonly skipLabel = input('Skip to main content');
}
