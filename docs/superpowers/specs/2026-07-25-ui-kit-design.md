# Bookly UI Kit — Design Spec

**Date:** 2026-07-25
**Status:** Implemented 2026-07-25
**Source of visual truth:** `DESIGN.md` (extracted from `docs/example-design/Library Dashboard.dc.html`)

## Goal

A reusable, extensible set of common Angular components implementing the Bookly design system, so feature screens (circulation, catalog, members, holds, fines) compose from shared primitives instead of re-styling per page.

## Constraints & decisions

- **Angular 22**, standalone components, signal `input()`/`output()`, inline templates, no NgModules — per `docs/angular-style.md`.
- **Tailwind CSS v4** via `@tailwindcss/postcss`. CSS-first config: design tokens declared in `@theme` in `src/styles.css`. No `tailwind.config.js`.
- **Icons:** `lucide-angular` (matches the mockup's lucide/feather stroke style, stroke-width 1.75, sizes 14–19px).
- **Fonts:** Gilroy OTFs (400/500/600/700/800) copied from `docs/example-design/fonts/` to `public/fonts/`, loaded via `@font-face` in `src/styles.css`.
- **No hex colors inside components** — components reference theme tokens (Tailwind utilities) only. All hex values live once, in `@theme`.
- **Architecture: hybrid** — attribute directives for style-only primitives (keep native element semantics), components for structural pieces (content projection / internal layout).

## Foundations (`src/styles.css`)

1. `@import "tailwindcss";` (v4 single import via PostCSS).
2. `@theme` block mapping DESIGN.md §1.1 tokens:
   - Surfaces/text: `brand #039DB7`, `brand-dark #027A8F`, `accent-pink #E2408E`, `ink #1B2533`, `ink-heading #2E3B4E`, `ink-muted #6B7687`, `ink-soft #3A4556`, `canvas #F5F7FA`, `surface #FFFFFF`, `line #D9DEE6` (border), `divider #EAEEF3`, `row-hover #F8FAFC`, `control #EEF2F7`.
   - Semantic: `success #1A754D`, `danger #BE2539`, `warning #A66812`; chart: `chart-teal`, `chart-cyan #45BBCE`, `chart-amber #F0B94A`, `chart-purple #7C59D3`.
   - Badge pairs (§1.2): bg/text tokens per palette (green, amber, red, cyan, neutral, pink, purple).
   - Font: `--font-sans: 'Gilroy', Arial, Helvetica, sans-serif`.
   - Radius: card `16px`; controls `8–10px`; pills `999px`.
3. `@font-face` × 5 weights, `font-display: swap`.
4. Global: body antialiased, custom scrollbar (8px, thumb `line`, radius 8), shared focus-ring rule (`box-shadow: 0 0 0 3px rgba(3,157,183,0.32)`, `outline: none`; 0.45 alpha variant on dark sidebar).

## Kit inventory (`src/app/ui/`)

One file per unit (`button.ts`, `badge.ts`, …) with its spec beside it. Inline templates. Public barrel `src/app/ui/index.ts`.

| Unit | Form | API |
|---|---|---|
| `uiBtn` | directive | `variant: 'primary' \| 'outline' \| 'pill' \| 'pill-muted' \| 'icon'`. No size axis — small = the `pill`/`pill-muted` variants (DESIGN.md §3.3 has no small primary/outline). Applies §3.3 styles to native `<button>`/`<a>`. |
| `uiBadge` | directive | `tone: 'success' \| 'warning' \| 'danger' \| 'info' \| 'neutral' \| 'pink' \| 'purple'`. §1.2 pill shape + palette pair. Semantic naming — consumer picks by meaning. |
| `ui-card` | component | Optional `title`, `subtitle` inputs; default content slot; optional `actions` slot (header right). §3.1. |
| `ui-kpi-card` | component | `label`, `value`, `delta?`, `deltaTone: 'good' \| 'bad' \| 'neutral'`, `hero?: boolean` (teal value). §3.2, ▲ glyph. |
| `ui-table` | component | Generic over row type: `columns: TableColumn<T>[]` (`key`, `header`, `width?`, `align?: 'left' \| 'right'`, `value?: (row: T) => string \| number`), `rows`, `rowKey` (fn). Custom cell rendering via named `ng-template` with `$implicit` row context. Empty state via projected `ui-empty-state`. §3.5 header/body/hover styles. |
| `ui-pagination` | component | `page` (two-way model, emits `pageChange`), `pageSize`, `total`; label inputs `prevLabel`/`nextLabel`/`navLabel` and `summary` format-fn input (English defaults, ADR-0004). The rendered page is clamped to `[1, pageCount]`, so a consumer-owned `page` left out of range by a shrinking `total` cannot produce an inverted summary or a dead prev/next button. Renders "Showing X–Y of N" + prev/next + numbered buttons, `aria-current="page"`. §3.8. |
| `ui-segmented` | component | `options: SegmentedOption[]` (`{label, value}`), two-way `value` model, required `groupLabel` (accessible name — a `radiogroup` without one is an AXE violation). `role="radiogroup"`, arrow-key navigation. §3.6. |
| `ui-search-input` | component | Two-way `value` model, `placeholder`, `debouncedChange` output (300ms). Magnifier icon absolute-left. §3.7. |
| `ui-progress` | component | `value`, `max = 100`, `color` (token name union), optional label row (name + value). §3.10. |
| `ui-avatar` | component | `name` → initials (max 2); deterministic palette cycle from name hash: `brand, accent-pink, chart-purple, chart-cyan, chart-amber, ink-heading`. `size?: number`. Decorative (`aria-hidden`) — always pair with visible text naming the person. §3.12. |
| `ui-empty-state` | component | `headline`, `message?`, optional action slot. §3.14. |
| `ui-list-item` | component | `icon` (lucide name), `iconTone` (badge palette), `title`, `meta?`; right-aligned slot. §3.11. |
| `ui-bar-chart` | component | `series: BarPoint[]` (`{label, value, secondary?}`), height 140px, CSS bars (teal/cyan), `title` tooltip per bar, `role="img"` + `aria-label`. §3.9. |
| `ToastService` + `ui-toast-host` | service + component | `show(message: string, duration = 2200)` and `dismiss(id: number)`; fixed bottom-right, auto-dismiss, `aria-live="polite"`. Host placed once in root layout. §3.13. |
| `ui-layout` | component | App shell: 260px dark sidebar + main column; slots: sidebar content, topbar, page content. §2. |
| `ui-sidebar-nav-item` | component | `icon`, `label`, `active`; renders styled button/link, §3.4 states. |
| `ui-topbar` | component | `pageTitle`, `subtitle?`; right-side `actions` slot. 76px. |

## Extensibility rules

- Variant/tone unions are string-literal types; class lists live in one `const Record<Variant, string>` per unit — adding a variant = one record entry + union member.
- Host `class` from the consumer always merges (directives append, never overwrite).
- Structural components expose slots (content projection) rather than boolean-flag renders where feasible.
- Everything themed via tokens; retheme = edit `@theme` only.

## Accessibility (WCAG AA / AXE)

- Native elements via directives (real `<button>`, `<a>`, `<table>`, `<input>`).
- Visible teal focus ring on all interactive elements; never remove focus without replacement.
- `scope="col"` headers; pagination `aria-current`; segmented `radiogroup`/`radio` + keyboard; toast `aria-live`; charts `role="img"` + label; icon-only buttons require `aria-label` (typed as required input on icon variant docs).
- Token contrast pairs meet AA at their usage sizes (badge text 12px/700 on tinted bg — all pairs ≥ 4.5:1). The green/amber/red badge text tokens and `--color-success`/`--color-danger` were darkened from the original mockup hexes (which measured 3.7–4.5:1) to reach AA; see `src/app/ui/contrast.spec.ts` for the verified ratios.

## Styleguide route

- Lazy route `/styleguide` (usage doc — ships in prod; Bookly is an internal staff tool): renders every component with all variants, on canvas background, roughly mirroring mockup sections. Serves as visual verification against `docs/example-design/Library Dashboard.dc.html`.

## Testing (vitest)

- Variant/tone class-map completeness (every union member has a record entry).
- Pagination math (ranges, boundaries, single page, empty).
- Table renders columns/rows, right-align, custom cell template, empty state.
- Toast lifecycle (show → auto-dismiss timing, multiple toasts).
- Avatar initials + deterministic color for same name.
- Segmented keyboard navigation + model updates.

## i18n

The kit is **i18n-agnostic** (ADR-0004): every user-visible string — labels, placeholders, aria-labels, the pagination summary — is an `input()` with an English default. The kit never imports Transloco; feature screens pass translated strings at the call site, where ADR-0003's translation keys live.

## Follow-ups (build with the first feature screen)

- **`status-tone` domain module** — one shared mapping from domain statuses to `BadgeTone` (e.g. `copyStatusTone`, `fineStatusTone`), seeded from DESIGN.md §1.2, in a domain layer file (e.g. `src/app/domain/status-tone.ts`). Prevents per-screen drift of "overdue→danger"-style decisions. The kit stays domain-free.
- **Layout user block** — DESIGN.md §2 sidebar bottom user block (teal avatar) demoed in the styleguide once the real user model exists.

## Out of scope

- Feature screens (circulation, members, …) — separate specs.
- Dark mode.
- Modal/dialog (mockup uses toasts, not modals).

## New dependencies

- `tailwindcss` v4 + `@tailwindcss/postcss` (dev)
- `lucide-angular` — **known tech debt:** v1.0.0 is deprecated (successor `@lucide/angular`) and its peer range is Angular 13–21 (works on 22, pnpm warns). Icons must be registered centrally in `app.config.ts` — an unregistered icon name **throws at render, including SSR prerender**. Migration deliberately deferred (decision 2026-07-25); revisit before Angular 23 or when it breaks.
