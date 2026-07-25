import { Component, computed, input, model } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

export function pageRange(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  return { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total) };
}

@Component({
  selector: 'ui-pagination',
  imports: [LucideAngularModule],
  template: `
    <div class="text-[13px] text-ink-muted">
      {{ summaryText() }}
    </div>
    <nav class="flex items-center gap-1.5" [attr.aria-label]="navLabel()">
      <button
        type="button"
        class="flex size-[30px] cursor-pointer items-center justify-center rounded-lg text-[13px] font-bold focus-ring border border-line bg-surface text-ink-soft disabled:cursor-default disabled:text-disabled"
        [disabled]="safePage() <= 1"
        (click)="go(safePage() - 1)"
        [attr.aria-label]="prevLabel()"
      >
        <lucide-angular name="chevron-left" [size]="16" />
      </button>
      @for (p of pages(); track p) {
        <button
          type="button"
          class="flex size-[30px] cursor-pointer items-center justify-center rounded-lg text-[13px] font-bold focus-ring"
          [class]="
            p === safePage()
              ? 'border-0 bg-brand text-white'
              : 'border border-line bg-surface text-ink-soft'
          "
          [attr.aria-current]="p === safePage() ? 'page' : null"
          (click)="go(p)"
        >
          {{ p }}
        </button>
      }
      <button
        type="button"
        class="flex size-[30px] cursor-pointer items-center justify-center rounded-lg text-[13px] font-bold focus-ring border border-line bg-surface text-ink-soft disabled:cursor-default disabled:text-disabled"
        [disabled]="safePage() >= count()"
        (click)="go(safePage() + 1)"
        [attr.aria-label]="nextLabel()"
      >
        <lucide-angular name="chevron-right" [size]="16" />
      </button>
    </nav>
  `,
  host: { class: 'flex items-center justify-between gap-4' },
})
export class UiPagination {
  readonly page = model(1);
  readonly pageSize = input(10);
  readonly total = input.required<number>();
  // i18n-agnostic per ADR-0004: consumers pass translated strings; English is only a default.
  readonly prevLabel = input('Previous page');
  readonly nextLabel = input('Next page');
  readonly navLabel = input('Pagination');
  readonly summary = input<(range: { from: number; to: number; total: number }) => string>(
    ({ from, to, total }) => `Showing ${from}–${to} of ${total}`,
  );
  protected readonly summaryText = computed(() =>
    this.summary()({ ...this.range(), total: this.total() }),
  );
  protected readonly count = computed(() => pageCount(this.total(), this.pageSize()));
  protected readonly pages = computed(() =>
    Array.from({ length: this.count() }, (_, i) => i + 1),
  );
  /**
   * `page` is a model the consumer owns, so it can fall out of range when
   * `total` shrinks under it (filtering a list while on a later page). Every
   * rendered and navigated value derives from this clamp, so the summary,
   * aria-current, and prev/next state stay consistent with `count()`.
   */
  protected readonly safePage = computed(() => Math.min(Math.max(1, this.page()), this.count()));
  protected readonly range = computed(() =>
    pageRange(this.safePage(), this.pageSize(), this.total()),
  );

  protected go(p: number): void {
    if (p >= 1 && p <= this.count() && p !== this.safePage()) this.page.set(p);
  }
}
