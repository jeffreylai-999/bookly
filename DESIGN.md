# Bookly — Design System

Reference spec for **Bookly**, a library management dashboard. Extracted from the design mockup `docs/example-design/Library Dashboard.dc.html` (the mockup uses the placeholder brand name "LibraryOS" — the official product name is Bookly). Use this to build new screens or components that match the existing look and feel.

The whole UI is a light-theme SaaS admin app: a dark slate sidebar, a white top bar, and a light-grey content canvas filled with white rounded cards, data tables, pill badges, and simple bar charts. Everything uses inline styles and the **Gilroy** typeface. There is no CSS framework and no external UI library — just plain HTML, SVG icons, and a small component-state layer.

---

## 1. Foundations

### 1.1 Color tokens

Core surfaces and text:

| Token | Hex | Use |
|---|---|---|
| `--brand` | `#039DB7` | Primary teal. Links, primary buttons, active accents, key metrics |
| `--brand-dark` | `#027A8F` | Teal hover / pressed, "on loan" text |
| `--accent-pink` | `#E2408E` | Secondary accent, notification badge, logo gradient end |
| `--ink` | `#1B2533` | Primary body text |
| `--ink-heading` | `#2E3B4E` | Headings, sidebar background, dark UI |
| `--ink-muted` | `#6B7687` | Secondary / muted text, table header labels |
| `--ink-soft` | `#3A4556` | Icon default, neutral badge text |
| `--bg-canvas` | `#F5F7FA` | App background behind cards |
| `--surface` | `#FFFFFF` | Cards, top bar, table, inputs |
| `--border` | `#D9DEE6` | Card borders, input borders, scrollbar thumb |
| `--divider` | `#EAEEF3` | Table row dividers |
| `--row-hover` | `#F8FAFC` | Table row hover |
| `--control-bg` | `#EEF2F7` | Segmented control track, progress-bar track |

Status / semantic colors:

| Token | Hex | Use |
|---|---|---|
| `--success` | `#1A754D` | Positive metrics, "available/active/paid/ready" |
| `--danger` | `#BE2539` | Overdue, unpaid, suspended, negative deltas |
| `--warning` | `#A66812` | "Reserved / due soon / expired" text (amber) |
| `--chart-teal` | `#039DB7` | Primary bars |
| `--chart-cyan` | `#45BBCE` | Secondary bars |
| `--chart-amber` | `#F0B94A` | Chart series |
| `--chart-purple` | `#7C59D3` | Chart series |

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

| Palette | Background | Text | Applied to |
|---|---|---|---|
| Green (positive) | `#E3F3EB` | `#1A754D` | Available, Active, Ready for pickup, Paid |
| Amber (caution) | `#FCEFDC` | `#935C10` | Reserved, Due soon, Expired, Sci-fi |
| Red (negative) | `#FBE3E7` | `#BE2539` | All out, Overdue, Suspended, Unpaid |
| Cyan (info) | `#E5F6F9` | `#027A8F` | On loan, Waiting, Fiction, Student |
| Neutral (grey) | `#EEF2F7` | `#3A4556` | Returned, Waived, default fallback |
| Pink | `#FCE4F0` | `#B9266E` | Non-fiction, Senior |
| Purple | `rgba(124,89,211,0.14)` | `#5B3DB8` | Children's, Staff |

Badge shape (all badges): `display:inline-flex; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700;`

### 1.3 Typography

Font family (self-hosted OTF in `docs/example-design/fonts/`, loaded via `@font-face`):

```
font-family: 'Gilroy', Arial, Helvetica, sans-serif;
```

Weights available: 400 regular, 500 medium, 600 semibold, 700 bold, 800 extrabold. Body uses `-webkit-font-smoothing: antialiased`.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Big metric (KPI) | 36px | 800 | `letter-spacing:-0.02em`; colored teal or ink-heading |
| Metric (reports/fines) | 30–32px | 800 | `letter-spacing:-0.02em` |
| Page title | 20px | 800 | `letter-spacing:-0.01em`, color `#2E3B4E` |
| Logo wordmark | 17px | 800 | `letter-spacing:-0.01em`, white |
| Card / section title | 15px | 700 | color `#2E3B4E` |
| Body / table cell | 13–14px | 400–600 | color `#1B2533` |
| Secondary / caption | 12–12.5px | 400–500 | color `#6B7687` |
| Uppercase label (KPI) | 12px | 700 | `text-transform:uppercase; letter-spacing:0.08em`, muted |
| Uppercase label (table head) | 12px | 700 | `text-transform:uppercase; letter-spacing:0.06em`, muted |
| Micro (chart axis, badge) | 11–12px | 400–700 | muted |

Rule of thumb: headings and large numbers get tight negative letter-spacing; small uppercase labels get positive letter-spacing.

### 1.4 Spacing, radius, elevation

- **Radius:** cards & table wrappers `16px`; inputs, buttons, small controls, nav items, segmented track, logo tile `8–10px`; pills, badges, avatars, primary/outline buttons `999px`; chart bars `4px 4px 0 0`.
- **Card padding:** `24px`.
- **Content padding:** `32px` around the scrollable page area.
- **Grid gaps:** `20px` between cards; `24px` between stacked sections.
- **Card border:** `1px solid #D9DEE6` (cards are outlined, not shadowed).
- **Elevation is rare** — used only for the toast (`0 24px 64px rgba(27,37,51,0.14)`) and the active segmented tab (`0 1px 2px rgba(27,37,51,0.08)`).
- **Focus ring:** `box-shadow: 0 0 0 3px rgba(3,157,183,0.32)` (0.45 on dark sidebar), with `outline:none`.
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
Card → uppercase muted label (12px/700, `letter-spacing:0.08em`) → big number (36px/800, `letter-spacing:-0.02em`, teal for the hero stat else `#2E3B4E`) → delta line (12.5px/600). Delta colors: up-good `#1A754D`, up-bad `#BE2539`, neutral/info `#027A8F`. Uses `▲` (`&#9650;`) as the trend glyph.

### 3.3 Buttons
- **Primary:** `padding:11px 20px; background:#039DB7; color:#fff; border:none; border-radius:999px; font-size:14px; font-weight:700;` hover `background:#027A8F`.
- **Outline:** same shape, `background:#fff; color:#039DB7; border:1px solid #039DB7;` hover `background:#E5F6F9`.
- Both `display:inline-flex; align-items:center; gap:8px;` and usually lead with a 16px stroke icon.
- **Small pill action** (in tables): `padding:6px 12px; border-radius:999px; font-size:12px; font-weight:700;` — teal-outline for the primary action ("Record payment"), grey-outline for the secondary ("Waive").
- **Icon button** (row actions, bell): `28–36px` square, `border-radius:8–999px`, `1px solid #D9DEE6` or transparent, hover `#F0F3F7`.

### 3.4 Sidebar nav item
```
display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:10px;
width:100%; text-align:left; border:none; font-size:14px; font-weight:600; cursor:pointer;
```
- Active: `color:#FFF; background:rgba(255,255,255,0.10)`
- Inactive: `color:rgba(255,255,255,0.68); background:transparent`
- Hover: `background:rgba(255,255,255,0.08)`
- Each item leads with an 18px lucide-style stroke icon (`stroke-width:1.75`).

### 3.5 Data table
Wrap in a card-style container: `background:#fff; border:1px solid #D9DEE6; border-radius:16px; overflow:hidden;` with `<table style="width:100%; border-collapse:collapse; table-layout:fixed;">`.
- **Header row:** `border-bottom:1px solid #D9DEE6;` cells are uppercase 12px/700 muted, `letter-spacing:0.06em`, padding `14px 24px` on the first/last column and `14px 12px` between. Set explicit `width:%` per column.
- **Body row:** `border-bottom:1px solid #EAEEF3;` hover `background:#F8FAFC;` cell padding `16px 24px` (edges) / `16px 12px` (middle), font 13.5px.
- Primary cell: 600 weight `#1B2533` with an optional 12.5px muted sub-line (e.g. author/email under title/name).
- Status columns render a badge (§1.2). Numeric columns are `text-align:right`.

### 3.6 Segmented control / tabs
Track: `display:flex; gap:4px; background:#EEF2F7; padding:4px; border-radius:10px; width:fit-content;`
Buttons: `padding:8px 16px; border-radius:8px; font-size:13.5px; font-weight:700; border:none;`
- Active: `color:#2E3B4E; background:#FFF; box-shadow:0 1px 2px rgba(27,37,51,0.08)`
- Inactive: `color:#6B7687; background:transparent`

### 3.7 Search input & select
- **Search:** relative wrapper with an absolutely-positioned 16px magnifier SVG at `left:12px`. Input: `padding:10px 14px 10px 36px; border:1px solid #D9DEE6; border-radius:8px; font-size:14px;` focus adds the teal ring + `border-color:#039DB7`.
- **Select:** `padding:10px 14px; border:1px solid #D9DEE6; border-radius:8px; font-size:14px; background:#fff;`
- Filter bars pair a search + select on the left and a right-aligned muted "N results" count, separated by a `flex:1` spacer.

### 3.8 Pagination
Right-aligned cluster: prev/next icon buttons (`30px` square, `1px solid #D9DEE6`, radius 8, disabled color `#C7CEDA`) around numbered page buttons. Page number: `min-width:30px; height:30px; border-radius:8px; font-size:13px; font-weight:700;` — active is `background:#039DB7; color:#fff; border:none`, inactive is white with `1px solid #D9DEE6`. Left side shows a muted "Showing X–Y of N" line.

### 3.9 Bar chart (CSS, no library)
Row of flex columns, container `display:flex; align-items:flex-end; gap:8px; height:140px;`. Each bar: `width:100%; max-width:24–28px; border-radius:4px 4px 0 0;` with `height` set as a percentage of the max value; label (11px muted) sits below. Primary series teal `#039DB7`, secondary cyan `#45BBCE`. Bars carry a `title` tooltip.

### 3.10 Progress / breakdown bar
Label row (13px: name in `#1B2533/600`, value in muted) above a track `height:8px; background:#EEF2F7; border-radius:999px; overflow:hidden;` with a fill `height:100%; width:{pct}%; border-radius:999px;` colored per series.

### 3.11 List item (holds / activity / overdue)
Horizontal `display:flex; gap:12px;` with a small rounded icon chip (`28–32px`, radius 8–999px, tinted background matching the semantic palette, e.g. green chip `#E3F3EB`/`#1A754D`) beside a title (13–13.5px/600) and a muted meta line. Overdue rows additionally right-align a red "N days" pill.

### 3.12 Avatar
Circle `border-radius:999px`, initials in white 12–13px/700, centered. Sidebar user avatar is solid teal `#039DB7`; table avatars cycle a palette: `#039DB7, #E2408E, #7C59D3, #45BBCE, #F0B94A, #2E3B4E`.

### 3.13 Toast
`position:fixed; bottom:28px; right:28px; background:#2E3B4E; color:#fff; padding:14px 22px; border-radius:12px; font-size:13.5px; font-weight:600; box-shadow:0 24px 64px rgba(27,37,51,0.14);` — auto-dismisses (~2.2s).

### 3.14 Empty state
Centered inside a card: `padding:48px 24px; text-align:center;` — 14px/600 `#2E3B4E` headline, 13px muted sub-line, optional pill "Clear filters" button (`border:1px solid #D9DEE6; background:#fff; color:#2E3B4E`).

### 3.15 Icons
All icons are inline SVG in the **lucide / feather** style: `viewBox="0 0 24 24"; fill:none; stroke:currentColor; stroke-width:1.75–2; stroke-linecap:round; stroke-linejoin:round;`. Size 14–19px depending on context. They inherit color via `currentColor`. The brand mark is a bookmark path (`M6 3h12v18l-6-4-6 4V3z`) inside the gradient tile.

---

## 4. Interaction & motion

- **Hover** is the main affordance: nav items lighten, table rows tint `#F8FAFC`, icon buttons go `#F0F3F7`, buttons darken/tint.
- **Focus** always shows the teal ring `0 0 0 3px rgba(3,157,183,0.32)` with `outline:none`.
- **No transitions/animations** are defined beyond the toast lifecycle — keep it snappy and static.
- Feedback for actions (renew, return, pay, waive, export) is delivered through the toast, not modals.

---

## 5. Content & voice

- Sentence case for titles and buttons ("Add title", "New checkout", "Record payment"). Labels are plain and functional.
- Dates format as `MMM D, YYYY` (e.g. `Jul 22, 2026`); currency as `$0.00`.
- Metrics pair a number with a short comparison ("▲ 12% vs yesterday", "2 new since yesterday").
- Empty states are friendly and reassuring ("Nothing overdue — nice.").

---

## 6. Source format note

The authoring file `docs/example-design/Library Dashboard.dc.html` is a **`.dc` component** — a single stateful component using custom tags (`<x-dc>`, `<sc-if>`, `<sc-for>`) and `{{ }}` bindings, with logic in a `<script type="text/x-dc">` class extending `DCLogic` (see the `state`, `setState`, and `renderVals()` pattern). Styling is entirely **inline** (no stylesheet, no utility classes), with a small `<helmet><style>` block only for `@font-face`, global resets, links, and scrollbars.

A self-contained rendered build (`LibraryOS Dashboard (standalone).html`, fonts inlined) existed for previewing the finished look but is not committed to this repo.

To reuse this design in another stack (React, plain HTML, etc.): treat the tokens in §1 as your theme, rebuild the components in §3 with the exact colors/radii/spacing, keep styling inline or port it to CSS variables using the token names above, and preserve the outlined-card + pill-badge + light-canvas character. Load Gilroy from `docs/example-design/fonts/` (regular 400 → extrabold 800) or substitute a similar geometric sans.
