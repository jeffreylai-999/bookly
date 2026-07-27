# Bookly — Design System

Reference spec for **Bookly**, a library management dashboard. Originally extracted from a design mockup that used the placeholder brand name "LibraryOS"; the official product name is Bookly. **This document is now the source of truth** — the mockup is not committed to the repo, so where the two ever disagreed, this wins. Use it to build new screens or components that match the existing look and feel.

The UI is a light-theme SaaS admin app: a dark slate sidebar, a white top bar, and a light-grey content canvas filled with white rounded cards, data tables, pill badges, and simple bar charts. The **Gilroy** typeface throughout.

The implementation lives in `src/app/ui/` as an Angular component kit, with the tokens below declared in the `@theme` block of `src/styles.css` (Tailwind v4, CSS-first). `src/app/ui/contrast.spec.ts` guards the contrast ratios this document claims. Browse every component and variant at the `/styleguide` route.

---

## 1. Foundations

### 1.1 Color tokens

Core surfaces and text:

| Token             | Hex       | Use                                                                                             |
| ----------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `--brand`         | `#039DB7` | Primary teal. Fills, borders, chart bars, the hero KPI numeral — **not small text** (see below) |
| `--brand-dark`    | `#027A8F` | Button fills and button label text, link text, "on loan" text                                   |
| `--brand-strong`  | `#016B7E` | Primary-button hover, focus-ring outer layer                                                    |
| `--accent-pink`   | `#E2408E` | Secondary accent, notification badge, logo gradient end                                         |
| `--ink`           | `#1B2533` | Primary body text                                                                               |
| `--ink-heading`   | `#2E3B4E` | Headings, sidebar background, dark UI                                                           |
| `--ink-muted`     | `#616C7D` | Secondary / muted text, table header labels                                                     |
| `--ink-soft`      | `#3A4556` | Icon default, neutral badge text                                                                |
| `--bg-canvas`     | `#F5F7FA` | App background behind cards                                                                     |
| `--surface`       | `#FFFFFF` | Cards, top bar, table, inputs                                                                   |
| `--border`        | `#D9DEE6` | Card borders, input borders, scrollbar thumb                                                    |
| `--divider`       | `#EAEEF3` | Table row dividers                                                                              |
| `--row-hover`     | `#F8FAFC` | Table row hover                                                                                 |
| `--control-bg`    | `#EEF2F7` | Segmented control track, progress-bar track                                                     |
| `--control-hover` | `#F0F3F7` | Icon-button and ghost-button hover                                                              |
| `--disabled`      | `#C7CEDA` | Disabled control glyphs (pagination arrows, disabled select)                                    |

Status / semantic colors:

| Token            | Hex       | Use                                                           |
| ---------------- | --------- | ------------------------------------------------------------- |
| `--success`      | `#1A754D` | Positive metrics, "available/active/paid/ready"               |
| `--danger`       | `#BE2539` | Overdue, unpaid, suspended, negative deltas, error toast fill |
| `--warning`      | `#A66812` | "Reserved / due soon / expired" text on white or canvas       |
| `--chart-teal`   | `#039DB7` | Primary bars                                                  |
| `--chart-cyan`   | `#45BBCE` | Secondary bars (always paired with a pattern — see §3.9)      |
| `--chart-amber`  | `#F0B94A` | Chart series                                                  |
| `--chart-purple` | `#7C59D3` | Chart series                                                  |

**Two ambers, on purpose.** `--warning #A66812` is amber text on white or canvas (4.56:1). The amber badge text `#935C10` in §1.2 is darker because it sits on the tinted `#FCEFDC` badge ground, which eats the difference. Pick by ground, not by mood.

### 1.1.1 Contrast rules

Every text/ground pair in this document clears WCAG AA (4.5:1 for normal text, 3:1 for large text and non-text UI). `src/app/ui/contrast.spec.ts` asserts the ratios; changing a token without running it is how these regress.

Three rules carry most of the weight:

- **`--brand` is not a text color at UI sizes.** White-on-`#039DB7` and `#039DB7`-on-white are both 3.23:1. Button labels are 12–14px bold, which WCAG does not count as large text, so they use `--brand-dark` (5.02:1) and hover to `--brand-strong` (6.17:1). `--brand` remains correct for fills, the 1px outline-button border (non-text, 3:1), chart bars, and the 36px/800 hero KPI numeral (large text, 3:1).
- **Muted text has four grounds, not one.** `--ink-muted` lands on white, canvas `#F5F7FA`, hovered rows `#F8FAFC`, and the segmented track `#EEF2F7`. It is set dark enough to clear 4.5:1 on the darkest of them (4.73:1 on `#EEF2F7`).
- **Color is never the only signal.** Delta direction carries a glyph and a screen-reader word alongside its tone color; the two chart series are separated by a stripe and a legend, not only by teal-vs-cyan (which is 1.42:1 apart).

Sidebar-only (on the `#2E3B4E` dark ground), text uses white at varying opacity:

- Active/primary label: `#FFFFFF`
- Inactive label: `rgba(255,255,255,0.68)`
- Secondary caption: `rgba(255,255,255,0.52)`
- Active nav background: `rgba(255,255,255,0.10)`
- Hover nav background: `rgba(255,255,255,0.08)`
- Divider on dark: `rgba(255,255,255,0.14)`

Signature logo gradient: `linear-gradient(135deg, #039DB7, #E2408E)`.

### 1.2 Badge / pill palettes

Badges are `bg` + `text` pairs. The same palette is reused across statuses, genres, and membership types — pick by meaning, not by literal label.

| Palette          | Background              | Text      | Applied to                                |
| ---------------- | ----------------------- | --------- | ----------------------------------------- |
| Green (positive) | `#E3F3EB`               | `#1A754D` | Available, Active, Ready for pickup, Paid |
| Amber (caution)  | `#FCEFDC`               | `#935C10` | Reserved, Due soon, Expired, Sci-fi       |
| Red (negative)   | `#FBE3E7`               | `#BE2539` | All out, Overdue, Suspended, Unpaid       |
| Cyan (info)      | `#E5F6F9`               | `#027A8F` | On loan, Waiting, Fiction, Student        |
| Neutral (grey)   | `#EEF2F7`               | `#3A4556` | Returned, Waived, default fallback        |
| Pink             | `#FCE4F0`               | `#B9266E` | Non-fiction, Senior                       |
| Purple           | `rgba(124,89,211,0.14)` | `#5B3DB8` | Children's, Staff                         |

Badge shape (all badges): `display:inline-flex; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700;`

### 1.3 Typography

Font family (self-hosted OTF in `public/fonts/`, served from `/fonts/` and loaded via `@font-face` in `src/styles.css`):

```
font-family: 'Gilroy', Arial, Helvetica, sans-serif;
```

Weights available: 400 regular, 500 medium, 600 semibold, 700 bold, 800 extrabold. Body uses `-webkit-font-smoothing: antialiased`.

| Role                         | Size      | Weight  | Notes                                                    |
| ---------------------------- | --------- | ------- | -------------------------------------------------------- |
| Big metric (KPI)             | 36px      | 800     | `letter-spacing:-0.02em`; colored teal or ink-heading    |
| Metric (reports/fines)       | 30–32px   | 800     | `letter-spacing:-0.02em`                                 |
| Page title                   | 20px      | 800     | `letter-spacing:-0.01em`, color `#2E3B4E`                |
| Logo wordmark                | 17px      | 800     | `letter-spacing:-0.01em`, white                          |
| Card / section title         | 15px      | 700     | color `#2E3B4E`                                          |
| Body / table cell            | 13–14px   | 400–600 | color `#1B2533`                                          |
| Secondary / caption          | 12–12.5px | 400–500 | color `#6B7687`                                          |
| Uppercase label (KPI)        | 12px      | 700     | `text-transform:uppercase; letter-spacing:0.08em`, muted |
| Uppercase label (table head) | 12px      | 700     | `text-transform:uppercase; letter-spacing:0.06em`, muted |
| Micro (chart axis, badge)    | 11–12px   | 400–700 | muted                                                    |

Rule of thumb: headings and large numbers get tight negative letter-spacing; small uppercase labels get positive letter-spacing.

### 1.4 Spacing, radius, elevation

- **Radius:** cards & table wrappers `16px`; inputs, buttons, small controls, nav items, segmented track, logo tile `8–10px`; pills, badges, avatars, primary/outline buttons `999px`; chart bars `4px 4px 0 0`.
- **Card padding:** `24px`.
- **Content padding:** `32px` around the scrollable page area.
- **Grid gaps:** `20px` between cards; `24px` between stacked sections.
- **Card border:** `1px solid #D9DEE6` (cards are outlined, not shadowed).
- **Elevation is rare** — used only for the toast (`0 24px 64px rgba(27,37,51,0.14)`) and the active segmented tab (`0 1px 2px rgba(27,37,51,0.08)`).
- **Focus ring:** two solid layers, `outline:none`.
  - Light grounds: `box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px #016B7E`
  - Dark sidebar: `box-shadow: 0 0 0 2px #2E3B4E, 0 0 0 4px #45BBCE`

  The inner layer matches the local ground so the outer reads as a ring rather than a thickened border, and stays visible when the focused element is itself teal. A single translucent wash cannot do this: `rgba(3,157,183,0.32)` over white measures 1.44:1, against the 3:1 that WCAG 2.2 SC 1.4.11 requires of a focus indicator.

- **Custom scrollbar:** `8px` wide, thumb `#D9DEE6`, radius `8px`.

---

## 2. Layout

Full-height flex shell, no page scroll — only the content region scrolls.

```
┌─────────────┬────────────────────────────────────────┐
│  Sidebar    │  Top bar (76px, white, bottom border)   │
│  260px      ├────────────────────────────────────────┤
│  #2E3B4E    │  Content canvas #F5F7FA                 │
│  full       │  padding 32px, overflow-y:auto          │
│  height     │  (KPI grid, cards, tables, charts)      │
└─────────────┴────────────────────────────────────────┘
```

- Root: `display:flex; height:100vh; width:100%; background:#F5F7FA; color:#1B2533; overflow:hidden;`
- **Skip link:** the first focusable element in the document, before the sidebar. Hidden until focused, then a white pill at `top:16px; left:16px`. Targets the `<main>` element, which carries `tabindex="-1"` so the fragment moves focus and not just scroll position. Without it every keyboard user tabs the whole nav on every page.
- **Sidebar:** `width:260px; flex-shrink:0; background:#2E3B4E; display:flex; flex-direction:column; padding:24px 16px;`. Order: logo block → nav → spacer (`flex:1`) → user block (separated by a top border on `rgba(255,255,255,0.14)`).
- **Main column:** `flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden;`
- **Top bar:** `height:76px; flex-shrink:0; padding:0 32px; border-bottom:1px solid #D9DEE6; background:#FFF;` — left holds title + subtitle, right holds the notification bell and the page's primary action button.
- **Content grids:** KPI row `grid-template-columns:repeat(4,1fr)`; feature rows use `2fr 1fr` or `1fr 1fr`; gap `20px`, `align-items:start`.

---

## 3. Components

### 3.1 Card

```
background:#FFF; border:1px solid #D9DEE6; border-radius:16px; padding:24px;
```

Section title inside: `font-size:15px; font-weight:700; color:#2E3B4E;` with a `12.5px #6B7687` subtitle below when needed.

### 3.2 KPI stat card

Card → uppercase muted label (12px/700, `letter-spacing:0.08em`) → big number (36px/800, `letter-spacing:-0.02em`, teal for the hero stat else `#2E3B4E`) → delta line (12.5px/600). Delta colors: good `#1A754D`, bad `#BE2539`, neutral/info `#027A8F`. Trend glyph is `▲` / `▼`, marked `aria-hidden`.

**Direction and tone are separate.** Tone says whether the news is good, direction says which way the number moved — overdue loans falling is `down` + `good`. The glyph follows direction and is paired with a visually-hidden "Up"/"Down", because otherwise the whole signal is colour and a decorative arrow.

### 3.3 Buttons

- **Primary:** `padding:11px 20px; background:#027A8F; color:#fff; border:none; border-radius:999px; font-size:14px; font-weight:700;` hover `background:#016B7E`.
- **Outline:** same shape, `background:#fff; color:#027A8F; border:1px solid #039DB7;` hover `background:#E5F6F9`.
- Fills and labels use `--brand-dark`, not `--brand` — a 14px bold label on `#039DB7` is 3.23:1 (§1.1.1). The border stays `--brand` because a border is non-text UI and only owes 3:1.
- Both `display:inline-flex; align-items:center; gap:8px;` and usually lead with a 16px stroke icon.
- **Small pill action** (in tables): `padding:6px 12px; border-radius:999px; font-size:12px; font-weight:700;` — teal-outline for the primary action ("Record payment"), grey-outline for the secondary ("Waive").
- **Icon button** (row actions, bell): `28–36px` square, `border-radius:8–999px`, `1px solid #D9DEE6` or transparent, hover `#F0F3F7`.

### 3.4 Sidebar nav item

```
display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:10px;
width:100%; text-align:left; border:none; font-size:14px; font-weight:600; cursor:pointer;
```

- Active: `color:#FFF; background:rgba(255,255,255,0.10)`, plus `aria-current="page"`
- Inactive: `color:rgba(255,255,255,0.68); background:transparent`
- Hover: `background:rgba(255,255,255,0.08)`
- Each item leads with an 18px lucide-style stroke icon (`stroke-width:1.75`).

**Navigation items are anchors, not buttons.** People keep dashboard tabs open; middle-click, ctrl-click, "copy link address" and the hover status bar all follow from the element being a real link and none survive a click handler. Active state comes from the router, not a passed-in flag. The button form is reserved for items that toggle something rather than navigate.

### 3.5 Data table

Wrap in a card-style container: `background:#fff; border:1px solid #D9DEE6; border-radius:16px; overflow:hidden;` with `<table style="width:100%; border-collapse:collapse; table-layout:fixed;">`.

- **Header row:** `border-bottom:1px solid #D9DEE6;` cells are uppercase 12px/700 muted, `letter-spacing:0.06em`, padding `14px 24px` on the first/last column and `14px 12px` between. Set explicit `width:%` per column.
- **Body row:** `border-bottom:1px solid #EAEEF3;` hover `background:#F8FAFC;` cell padding `16px 24px` (edges) / `16px 12px` (middle), font 13.5px.
- Primary cell: 600 weight `#1B2533` with an optional 12.5px muted sub-line (e.g. author/email under title/name).
- Status columns render a badge (§1.2). Numeric columns are `text-align:right`.
- **Caption:** every table carries a visually-hidden `<caption>` naming it.
- **Overflow:** the table sits in an `overflow-x:auto` region with a `min-width`, and that region is `tabindex="0"` with `role="region"` + the caption as its label. A catalog table runs past 8 columns; a scroll container a keyboard cannot reach strands its own content (WCAG 2.1.1).

**Sorting.** Sortable headers render their label as a button with a chevron (`chevrons-up-down` unsorted, `chevron-up`/`chevron-down` sorted) and the `<th>` carries `aria-sort`. Clicking cycles ascending → descending → unsorted. The table does **not** reorder its own rows: a server-paged table sorts in the query, and a view that quietly re-sorted the page it was handed would fight that. Client-side callers pipe rows through the `sortRows` helper, the same shape as pagination's `pageRange`.

**Selection.** An optional leading checkbox column, 48px wide, `accent-color:#027A8F`. Selected rows tint `#E5F6F9`. Each row checkbox gets a label naming its row ("Select Dune"); the header checkbox goes indeterminate on a partial selection. Select-all covers only the rendered rows, so it never silently selects rows on other pages that nobody can see. Bulk actions appear in a bar above the table while a selection exists.

### 3.6 Segmented control / tabs

Track: `display:flex; gap:4px; background:#EEF2F7; padding:4px; border-radius:10px; width:fit-content;`
Buttons: `padding:8px 16px; border-radius:8px; font-size:13.5px; font-weight:700; border:none;`

- Active: `color:#2E3B4E; background:#FFF; box-shadow:0 1px 2px rgba(27,37,51,0.08)`
- Inactive: `color:#6B7687; background:transparent`

### 3.7 Search input & select

- **Search:** relative wrapper with an absolutely-positioned 16px magnifier SVG at `left:12px`. Input: `padding:10px 14px 10px 36px; border:1px solid #D9DEE6; border-radius:8px; font-size:14px;` focus adds the teal ring + `border-color:#039DB7`. Typing debounces at 300ms; Enter submits at once and cancels the pending debounce.
- **Scan mode:** the circulation-desk variant. Icon becomes `scan-barcode`, `autocomplete=off`, `spellcheck=false`, `enterkeyhint=go`. Debounce is off entirely and Enter clears the field for the next item. A barcode gun types an ISBN in milliseconds then sends Enter — under plain debounce that scan waits 300ms and a second scan inside the window cancels the first outright.
- **Select:** `padding:10px 14px; border:1px solid #D9DEE6; border-radius:8px; font-size:14px; background:#fff;` with an inline chevron at `right:12px`. A native `<select>`, not a custom listbox: the platform control already brings keyboard support, type-ahead, and the mobile picker, and a filter bar needs nothing more. Any placeholder row is `disabled` so it cannot be submitted as a value.

  Selection is set per `<option>`, never by binding `value` on the `<select>`. Two pieces of spec behaviour force this: assigning `select.value` before its options exist is silently dropped, and the selectedness algorithm skips disabled options, so a disabled placeholder has to say `selected` to display at all. A select with no placeholder also adopts its first option when the bound value matches nothing — a native select always has something selected, so a value the options cannot represent would leave the model reading `''` while the user sees the first option chosen.

- Filter bars pair a search + select on the left and a right-aligned muted "N results" count, separated by a `flex:1` spacer.

### 3.7.1 Form field

Label + control + one message. `<label>` 13px/600 `#1B2533`, `margin-bottom:6px`, bound to the control's id; optional required asterisk is `aria-hidden`. Below the control sits either a 12px muted hint or a 12px `#BE2539` error with `role="alert"` — never both, so only one id is ever in `aria-describedby`.

### 3.8 Pagination

Right-aligned cluster: prev/next icon buttons (`30px` square, `1px solid #D9DEE6`, radius 8, disabled color `#C7CEDA`) around numbered page buttons. Page number: `min-width:30px; height:30px; border-radius:8px; font-size:13px; font-weight:700;` — active is `background:#039DB7; color:#fff; border:none`, inactive is white with `1px solid #D9DEE6`. Left side shows a muted "Showing X–Y of N" line.

### 3.9 Bar chart (CSS, no library)

Row of flex columns, container `display:flex; align-items:flex-end; gap:8px; height:140px;`. Each bar: `width:100%; max-width:24–28px; border-radius:4px 4px 0 0;` with `height` set as a percentage of the max value; label (11px muted) sits below. Primary series teal `#039DB7`, secondary cyan `#45BBCE`. Bars carry a `title` tooltip.

Two accessibility requirements travel with this component:

- **The bars are `aria-hidden` and the data ships as a visually-hidden `<table>`** beside them, captioned with the chart's name. A bar encodes its number as a pixel height, so a lone `role="img"` + `aria-label` would announce the chart's title and none of its content.
- **A second series needs more than hue.** Teal and cyan are 1.42:1 apart — indistinguishable in deuteranopia and in greyscale. The secondary bar carries a 45° white stripe (`repeating-linear-gradient`) and a legend names both series.

### 3.10 Progress / breakdown bar

Label row (13px: name in `#1B2533/600`, value in muted) above a track `height:8px; background:#EEF2F7; border-radius:999px; overflow:hidden;` with a fill `height:100%; width:{pct}%; border-radius:999px;` colored per series.

### 3.11 List item (holds / activity / overdue)

Horizontal `display:flex; gap:12px;` with a small rounded icon chip (`28–32px`, radius 8–999px, tinted background matching the semantic palette, e.g. green chip `#E3F3EB`/`#1A754D`) beside a title (13–13.5px/600) and a muted meta line. Overdue rows additionally right-align a red "N days" pill.

### 3.12 Avatar

Circle `border-radius:999px`, initials in white 12–13px/700, centered. Sidebar user avatar is solid teal `#039DB7`; table avatars cycle a palette: `#039DB7, #E2408E, #7C59D3, #45BBCE, #F0B94A, #2E3B4E`.

### 3.13 Toast

`position:fixed; bottom:28px; right:28px; background:#2E3B4E; color:#fff; padding:14px 22px; border-radius:12px; font-size:13.5px; font-weight:600; box-shadow:0 24px 64px rgba(27,37,51,0.14);` — auto-dismisses (~2.2s). Each toast has a close button.

- **Confirmations** are `role="status"` / `aria-live="polite"` on the ink-heading ground and time out.
- **Errors** are `role="alert"` / `aria-live="assertive"` on the `#BE2539` ground and persist until dismissed. A 2.2s error is an error nobody read.
- The stack container is `pointer-events:none` so it never blocks the page; each toast re-enables them, or a persistent error could never be closed.

### 3.14 Empty state

Centered inside a card: `padding:48px 24px; text-align:center;` — 14px/600 `#2E3B4E` headline, 13px muted sub-line, optional pill "Clear filters" button (`border:1px solid #D9DEE6; background:#fff; color:#2E3B4E`).

### 3.14.1 Skeleton

Loading placeholder: stack of `#EEF2F7` bars, `height:14px` default, `border-radius:8px`, `gap:10px`, ragged widths so they read as text rather than as a chart. `aria-hidden` — the container announces "Loading X" once, instead of one entry per bar.

This is the one animated component (`animate-pulse`), and it opts out under `prefers-reduced-motion`. A static grey block is indistinguishable from an empty state or a broken layout, which is the failure §4 is otherwise trying to avoid.

### 3.14.2 Dialog

Native `<dialog>` opened with `showModal()`: `width:min(92vw,32rem); border-radius:16px; border:1px solid #D9DEE6; background:#fff;` backdrop `rgba(46,59,78,0.40)`. Header holds a 15px/700 heading (referenced by `aria-labelledby`), an optional 12.5px muted subtitle, and a close icon button; the footer is a right-aligned action row above a `#EAEEF3` top border.

§4 prefers a toast to a modal for action feedback, and that still holds — this is for what a toast cannot carry: forms ("Add title", "Edit patron") and destructive confirmations. The native element is used rather than a hand-rolled overlay because focus trapping, the inert backdrop, Escape-to-close, and top-layer stacking all come free and are all easy to get wrong.

### 3.15 Icons

All icons are inline SVG in the **lucide / feather** style: `viewBox="0 0 24 24"; fill:none; stroke:currentColor; stroke-width:1.75–2; stroke-linecap:round; stroke-linejoin:round;`. Size 14–19px depending on context. They inherit color via `currentColor`. The brand mark is a bookmark path (`M6 3h12v18l-6-4-6 4V3z`) inside the gradient tile.

---

## 4. Interaction & motion

- **Hover** is the main affordance: nav items lighten, table rows tint `#F8FAFC`, icon buttons go `#F0F3F7`, buttons darken/tint.
- **Focus** always shows the two-layer teal ring from §1.4 with `outline:none`.
- **Color is never the only carrier of meaning.** Anything conveyed by tone — status, delta direction, chart series — also has text, a glyph, or a pattern.
- **Motion is limited to a 100ms `transition-colors` on hover/focus states**, plus the toast lifecycle and the skeleton pulse. Nothing moves, scales, or slides. The instant snap the original mockup had reads as flicker when a pointer sweeps a table; 100ms is under the threshold where a transition feels like an animation.
- **`prefers-reduced-motion`** disables the skeleton pulse. Color transitions are unaffected — they carry no motion.
- Feedback for actions (renew, return, pay, waive, export) is delivered through the toast, not modals. Modals are for forms and destructive confirmations (§3.14.2).

---

## 5. Content & voice

- Sentence case for titles and buttons ("Add title", "New checkout", "Record payment"). Labels are plain and functional.
- Dates format as `MMM D, YYYY` (e.g. `Jul 22, 2026`); currency as `$0.00`.
- Metrics pair a number with a short comparison ("▲ 12% vs yesterday", "2 new since yesterday").
- Empty states are friendly and reassuring ("Nothing overdue — nice.").

---

## 6. Origin and reuse

The design started as a single-file HTML mockup with entirely inline styles, under the placeholder name "LibraryOS". That file is not in the repo. What survived of it is this document plus the component kit in `src/app/ui/`, and both have since moved past it — most visibly on contrast (§1.1.1), on colour-only encoding (§3.2, §3.9), and on motion (§4).

To reuse this design in another stack: treat the tokens in §1 as your theme, rebuild the components in §3 with the exact colors, radii, and spacing, and preserve the outlined-card + pill-badge + light-canvas character. Load Gilroy (regular 400 → extrabold 800) or substitute a similar geometric sans. Port `contrast.spec.ts` too — it is what keeps the palette honest when someone reaches for `--brand` as a text colour.

## 7. Known gaps

Specced nowhere yet, and worth designing before the screens that need them are built:

- **Responsive shell.** The 260px sidebar does not collapse and the KPI grid is a fixed `repeat(4,1fr)`. The table scrolls horizontally (§3.5) but the shell around it does not adapt.
- **Density toggle.** 16px row padding fits roughly eight rows on screen; staff working a 200-row hold queue want a compact mode.
- **Cover thumbnails.** `ui-avatar` covers people. Book items need a 2:3 thumbnail with a fallback.
- **Overdue day pill.** §3.11 describes it; no component exists.
- **Error and offline states.** Skeleton (§3.14.1) and empty (§3.14) exist; "this failed to load, retry" does not.
