import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

export type DateRangePresetId = 'lastWeek' | 'lastMonth' | 'last3Months';

export interface DateRangePreset {
  id: DateRangePresetId;
  label: string;
}

export interface DateRangeValue {
  from: string;
  to: string;
}

export const DEFAULT_DATE_RANGE_PRESETS: DateRangePreset[] = [
  { id: 'lastWeek', label: 'Last week' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'last3Months', label: 'Last 3 months' },
];

interface CalendarDay {
  iso: string;
  date: number;
  inMonth: boolean;
}

let nextDateRangeId = 0;

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function subtractMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getMonth() - months;
  const lastDayOfTargetMonth = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(date.getFullYear(), targetMonth, Math.min(date.getDate(), lastDayOfTargetMonth));
}

export function rangeForPreset(id: DateRangePresetId, today: Date): DateRangeValue {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (id) {
    case 'lastWeek': {
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'lastMonth': {
      return { from: toIsoDate(subtractMonthsClamped(end, 1)), to: toIsoDate(end) };
    }
    case 'last3Months': {
      return { from: toIsoDate(subtractMonthsClamped(end, 3)), to: toIsoDate(end) };
    }
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function monthGrid(month: Date): CalendarDay[] {
  const start = startOfMonth(month);
  const cursor = new Date(start);
  cursor.setDate(1 - start.getDay());
  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    days.push({
      iso: toIsoDate(cursor),
      date: cursor.getDate(),
      inMonth: cursor.getMonth() === month.getMonth(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Dual-month range picker with quick presets. i18n-agnostic (ADR-0004):
 * labels are inputs with English defaults.
 */
@Component({
  selector: 'ui-date-range',
  imports: [LucideAngularModule],
  template: `
    <div
      class="flex h-10 w-full items-center rounded-lg border bg-surface transition-colors duration-100 focus-within:border-brand"
      [class.border-brand]="open()"
      [class.border-line]="!open()"
    >
      <button
        #trigger
        type="button"
        class="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent py-0 pl-3 pr-2 text-left text-sm text-ink focus-ring"
        [id]="controlId() ?? null"
        [attr.aria-label]="ariaLabel() ?? null"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="panelId"
        [attr.aria-describedby]="describedBy() ?? null"
        aria-haspopup="dialog"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
      >
        <lucide-angular
          name="calendar"
          [size]="16"
          [strokeWidth]="1.75"
          class="block size-4 shrink-0 text-ink-muted"
          aria-hidden="true"
        />
        <span class="flex h-4 min-w-0 flex-1 items-center leading-none">
          @if (displayRange().from; as fromDate) {
            <span class="truncate font-medium text-ink">{{ fromDate }}</span>
            <span class="shrink-0 px-3.5 text-ink-muted">{{ toSeparator() }}</span>
            <span
              class="truncate font-medium"
              [class.text-ink]="endDateClass() === 'ink'"
              [class.text-ink-muted]="endDateClass() === 'muted'"
            >
              {{ endDateText() }}
            </span>
          } @else {
            <span class="truncate text-ink-muted">{{ placeholder() }}</span>
          }
        </span>
      </button>
      @if (from() || to() || draftStart()) {
        <button
          type="button"
          class="-ml-0.5 mr-1.5 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-ink-muted transition-colors duration-100 hover:bg-control-hover hover:text-ink-soft focus-ring"
          [attr.aria-label]="clearLabel()"
          (click)="clear($event)"
        >
          <lucide-angular name="x" [size]="14" [strokeWidth]="2" />
        </button>
      }
    </div>

    @if (open()) {
      <div
        #panel
        role="dialog"
        [id]="panelId"
        [attr.popover]="canPopover ? 'manual' : null"
        [attr.aria-label]="dialogLabel()"
        class="fixed z-50 m-0 overflow-visible rounded-xl border border-line bg-surface shadow-toast date-range-in motion-reduce:animate-none"
        [style.top.px]="panelTop()"
        [style.left.px]="panelLeft()"
      >
        <span
          class="pointer-events-none absolute size-2.5 rotate-45 border-line bg-surface"
          [class.border-b]="openUp()"
          [class.border-r]="openUp()"
          [class.border-l]="!openUp()"
          [class.border-t]="!openUp()"
          [style.top.px]="openUp() ? null : -5"
          [style.bottom.px]="openUp() ? -5 : null"
          [style.left.px]="caretLeft()"
        ></span>
        <div class="flex flex-col md:flex-row">
          <div class="flex flex-row gap-1 border-b border-divider p-3 md:w-40 md:flex-col md:border-b-0 md:border-r">
            @for (preset of presets(); track preset.id) {
              <button
                type="button"
                class="rounded-md px-3 py-2 text-left text-sm text-ink transition-colors duration-100 hover:bg-control-hover focus-ring"
                [class.bg-badge-cyan-bg]="isActivePreset(preset.id)"
                [class.font-semibold]="isActivePreset(preset.id)"
                [class.text-brand-dark]="isActivePreset(preset.id)"
                (click)="applyPreset(preset.id)"
              >
                {{ preset.label }}
              </button>
            }
          </div>
          <div class="flex flex-col gap-8 p-4 sm:flex-row sm:gap-10">
            @for (month of visibleMonths(); track $index; let pane = $index) {
              <div class="w-[17.5rem]">
                <div class="mb-3 flex items-center gap-0.5">
                  <button
                    type="button"
                    class="flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors duration-100 hover:bg-control-hover hover:text-ink focus-ring"
                    [attr.aria-label]="prevYearLabel()"
                    (click)="shift(pane, -12)"
                  >
                    <lucide-angular name="chevrons-left" [size]="14" [strokeWidth]="2" />
                  </button>
                  <button
                    type="button"
                    class="flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors duration-100 hover:bg-control-hover hover:text-ink focus-ring"
                    [attr.aria-label]="prevMonthLabel()"
                    (click)="shift(pane, -1)"
                  >
                    <lucide-angular name="chevron-left" [size]="14" [strokeWidth]="2" />
                  </button>
                  <p class="min-w-0 flex-1 text-center text-[13px] font-bold text-ink-heading">
                    {{ monthTitle(month) }}
                  </p>
                  <button
                    type="button"
                    class="flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors duration-100 hover:bg-control-hover hover:text-ink focus-ring"
                    [attr.aria-label]="nextMonthLabel()"
                    (click)="shift(pane, 1)"
                  >
                    <lucide-angular name="chevron-right" [size]="14" [strokeWidth]="2" />
                  </button>
                  <button
                    type="button"
                    class="flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors duration-100 hover:bg-control-hover hover:text-ink focus-ring"
                    [attr.aria-label]="nextYearLabel()"
                    (click)="shift(pane, 12)"
                  >
                    <lucide-angular name="chevrons-right" [size]="14" [strokeWidth]="2" />
                  </button>
                </div>
                <div class="grid grid-cols-7">
                  @for (label of weekdayLabels(); track label) {
                    <span class="pb-1 text-center text-[11px] font-semibold text-ink-muted">{{
                      label
                    }}</span>
                  }
                  @for (day of monthGrid(month); track day.iso) {
                    <div class="relative flex h-8 items-center justify-center">
                      @if (inRange(day.iso) && displayRange().from !== displayRange().to) {
                        <span
                          class="absolute inset-y-1 bg-badge-cyan-bg"
                          [class.left-0]="!isStart(day.iso)"
                          [class.left-1/2]="isStart(day.iso)"
                          [class.right-0]="!isEnd(day.iso)"
                          [class.right-1/2]="isEnd(day.iso)"
                        ></span>
                      }
                      <button
                        type="button"
                        [class]="dayClass(day)"
                        [attr.data-iso]="day.iso"
                        [attr.aria-label]="dayLabel(day.iso)"
                        [attr.aria-pressed]="isStart(day.iso) || isEnd(day.iso)"
                        (click)="pick(day.iso)"
                        (mouseenter)="hovered.set(day.iso)"
                        (mouseleave)="hovered.set(null)"
                      >
                        {{ day.date }}
                      </button>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class UiDateRange {
  readonly from = input('');
  readonly to = input('');
  readonly rangeChange = output<DateRangeValue>();
  readonly controlId = input<string>();
  readonly describedBy = input<string | null>(null);
  readonly ariaLabel = input<string>();
  readonly placeholder = input('Select dates');
  readonly toSeparator = input('To');
  readonly clearLabel = input('Clear dates');
  readonly dialogLabel = input('Choose date range');
  readonly locale = input('en');
  readonly prevMonthLabel = input('Previous month');
  readonly nextMonthLabel = input('Next month');
  readonly prevYearLabel = input('Previous year');
  readonly nextYearLabel = input('Next year');
  readonly presets = input<DateRangePreset[]>(DEFAULT_DATE_RANGE_PRESETS);

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly triggerRef = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly open = signal(false);
  protected readonly openUp = signal(false);
  protected readonly panelTop = signal(0);
  protected readonly panelLeft = signal(0);
  protected readonly caretLeft = signal(16);
  protected readonly draftStart = signal<string | null>(null);
  protected readonly hovered = signal<string | null>(null);
  private readonly leftMonth = signal(startOfMonth(new Date()));
  private readonly rightMonth = signal(addMonths(startOfMonth(new Date()), 1));

  protected readonly panelId = `ui-date-range-${nextDateRangeId++}-panel`;
  protected readonly canPopover =
    typeof HTMLElement !== 'undefined' &&
    typeof HTMLElement.prototype.showPopover === 'function';

  protected readonly visibleMonths = computed(() => [this.leftMonth(), this.rightMonth()]);

  protected readonly weekdayLabels = computed(() => {
    const fmt = new Intl.DateTimeFormat(this.locale(), { weekday: 'short' });
    const sunday = new Date(2023, 11, 31);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + i);
      return fmt.format(day);
    });
  });

  protected readonly displayRange = computed(() => {
    const draft = this.draftStart();
    const hover = this.hovered();
    if (draft && hover) {
      return draft <= hover ? { from: draft, to: hover } : { from: hover, to: draft };
    }
    if (draft) {
      return { from: draft, to: draft };
    }
    return { from: this.from(), to: this.to() };
  });

  protected readonly endDateText = computed(() => {
    const range = this.displayRange();
    if (this.draftStart() && range.from === range.to) {
      return 'YYYY-MM-DD';
    }
    return range.to || 'YYYY-MM-DD';
  });

  protected readonly endDateClass = computed(() => {
    const range = this.displayRange();
    if (!range.to || (this.draftStart() && range.from === range.to)) {
      return 'muted';
    }
    return 'ink';
  });

  constructor() {
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
    });
  }

  protected monthGrid = monthGrid;

  protected monthTitle(month: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { month: 'long', year: 'numeric' }).format(month);
  }

  protected dayLabel(iso: string): string {
    const date = parseIsoDate(iso);
    if (!date) {
      return iso;
    }
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'long' }).format(date);
  }

  protected isStart(iso: string): boolean {
    return iso === this.displayRange().from;
  }

  protected isEnd(iso: string): boolean {
    return iso === this.displayRange().to;
  }

  protected inRange(iso: string): boolean {
    const { from, to } = this.displayRange();
    return !!from && !!to && iso >= from && iso <= to;
  }

  protected isActivePreset(id: DateRangePresetId): boolean {
    const preset = rangeForPreset(id, new Date());
    return this.from() === preset.from && this.to() === preset.to && !this.draftStart();
  }

  protected dayClass(day: CalendarDay): string {
    const base =
      'relative z-10 flex size-8 items-center justify-center rounded-full text-[13px] transition-colors duration-100 focus-ring';
    if (this.isStart(day.iso) || this.isEnd(day.iso)) {
      return `${base} bg-brand-dark font-semibold text-white`;
    }
    if (!day.inMonth) {
      return `${base} text-disabled hover:bg-control-hover`;
    }
    return `${base} text-ink hover:bg-control-hover`;
  }

  protected toggle(): void {
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
    this.draftStart.set(null);
    this.hovered.set(null);
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    this.draftStart.set(null);
    this.hovered.set(null);
    this.rangeChange.emit({ from: '', to: '' });
    this.close();
  }

  protected applyPreset(id: DateRangePresetId): void {
    this.draftStart.set(null);
    this.hovered.set(null);
    const range = rangeForPreset(id, new Date());
    this.rangeChange.emit(range);
    this.close();
  }

  protected pick(iso: string): void {
    const start = this.draftStart();
    if (!start) {
      this.draftStart.set(iso);
      this.hovered.set(iso);
      return;
    }
    const from = start <= iso ? start : iso;
    const to = start <= iso ? iso : start;
    this.draftStart.set(null);
    this.hovered.set(null);
    this.rangeChange.emit({ from, to });
    this.close();
  }

  protected shift(pane: number, months: number): void {
    if (pane === 0) {
      this.leftMonth.update((current) => addMonths(current, months));
      return;
    }
    this.rightMonth.update((current) => addMonths(current, months));
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target;
    if (!(target instanceof Node) || !this.elementRef.nativeElement.contains(target)) {
      this.close();
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!this.open()) this.openPanel();
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
      default:
        return;
    }
  }

  private openPanel(): void {
    this.syncVisibleMonths();
    this.open.set(true);
  }

  private showRange(from: string, to: string): void {
    const start = parseIsoDate(from) ?? new Date();
    const end = parseIsoDate(to);
    this.leftMonth.set(startOfMonth(start));
    if (end && (end.getFullYear() !== start.getFullYear() || end.getMonth() !== start.getMonth())) {
      this.rightMonth.set(startOfMonth(end));
      return;
    }
    this.rightMonth.set(addMonths(startOfMonth(start), 1));
  }

  private syncVisibleMonths(): void {
    this.showRange(this.from() || toIsoDate(new Date()), this.to());
  }

  private positionPanel(): void {
    const trigger = this.triggerRef().nativeElement;
    const panel = this.panelRef()?.nativeElement;
    if (!panel || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const gap = 10;
    const height = panel.offsetHeight;
    const width = panel.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = height > 0 && spaceBelow < height && rect.top > spaceBelow;
    this.openUp.set(openUp);
    const top = openUp ? rect.top - height - gap : rect.bottom + gap;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const left = Math.min(Math.max(8, rect.left), maxLeft);
    this.panelTop.set(top);
    this.panelLeft.set(left);
    this.caretLeft.set(Math.min(width - 16, Math.max(16, rect.left + rect.width / 2 - left - 5)));
  }
}
