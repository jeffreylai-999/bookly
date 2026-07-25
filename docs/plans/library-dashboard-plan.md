# Library Management Dashboard — Product Plan

> **SUPERSEDED (2026-07-24):** the design decisions in this file have been refined and in places overridden. **Source of truth: `docs/superpowers/specs/2026-07-23-library-dashboard-design.md`** (three revision passes: gap fixes, security review, verify passes). Read this file for product background only — do not implement from it.

**Purpose of this document:** planning input for a later spec. It captures the refined feature set, priority tiers, scope boundaries, and known gaps. It is not the spec itself.

**Product type:** staff-facing back-office desk tool (not a patron-facing portal).

**Design principle:** this is a tool staff transact in, not a records viewer they inspect. Daily work is scan-first (member card, item barcode) with type-to-search as the fallback.

---

## Priority tiers

- **P0** — the working desk core. Without this the library cannot operate.
- **P1** — makes the day easier once the core works.
- **P2** — analytics and reporting, valuable but not blocking.

---

## Global shell

Shared across all pages.

- Sidebar nav (7 pages, active state)
- Scan-anywhere input (member card / item barcode, keyboard-wedge friendly)
- Notification bell with defined triggers: hold ready, item overdue, payment recorded (unread badge + toast)
- Contextual top-bar action button
- Toast confirmations
- Focus rings, hover states, empty states
- Live search / filter / pagination
- Role awareness (staff vs admin gating for waive, void, delete)

---

## P0 — Working desk core

### Circulation (the transaction spine)

- **Check-out flow:** identify member (scan or search) > scan/add items > auto due-date assignment > fine-balance / block check > confirm
- **Check-in flow:** scan item > overdue flag + fine surfaced > damaged/lost marking > "fills a waiting hold?" prompt
- Renew action (respects renewal-limit rule)
- Return action
- Returned-timestamp display
- Monitoring tabs (active / overdue / returned)
- Member/title search, loan table, empty states

### Catalog

- Title/author search, genre filter, result count
- Per-title copy availability (X of Y available, who holds the rest)
- Inline actions from a result: start checkout, place hold
- Add title, edit copy, mark lost/damaged, retire item
- Paginated table (standard columns plus availability), numbered pagination
- Empty state with clear-filters

### Members

- Name search, status filter, result count
- **Member detail view:** current loans, hold queue, fine history, contact info
- Add member, edit member, suspend/block (fine-threshold or manual)
- Paginated table (avatar / type / loans / fines / joined / status), numbered pagination
- Empty state with clear-filters

### Reservations & holds

- Place hold, cancel hold, mark ready, notify member, auto-release on expiry
- Queue position + expiry display
- Status filter, result count, holds table, empty state
- Wired to check-in: a returned item offers to fill the next person in the queue

### Fines & payments

- Fine origin explicit: auto-generated on overdue return, with the accrual rule visible
- Record payment (full and partial) with receipt confirmation
- Waive with a reason field (audited)
- 3 summary stat cards, status filter, fines table, empty state
- Member balance exposed back to Circulation to gate checkout

---

## P1 — Launchpad

### Overview

Home screen works as a launchpad, not a poster.

- Quick-action strip (checkout, check-in)
- Action lists, each with an empty state: holds ready, due back today, top overdue (with accruing fine)
- Recent activity feed
- Decision-oriented stat cards (overdue count, holds waiting, fines outstanding)
- 14-day trend chart demoted to a small widget, or moved to Reports

---

## P2 — Analytics

### Reports

Keep lean for v1.

- Range selector (7/14/30-day), dynamic subtitle
- Action-oriented reports: overdue aging, collection usage (dead stock to weed, high-demand to reorder), fine collection, new-member growth
- CSV export on each report
- Genre breakdown bars and peak-hours chart kept as secondary

---

## Known gaps

Things not yet in the feature set. Split by whether they should block v1.

### Decide before building (shapes the data model)

- **Settings / rules layer.** Loan periods, renewal limits, fine rates, hold expiry windows, borrowing caps by member type. Currently baked invisibly into the flows. Decide now: hardcoded constants or admin-configurable? This choice affects the data model even if the settings UI comes later.
- **Audit trail.** Beyond the fine-waive reason, there is no record of who checked out, who voided a payment, who blocked a member. Libraries handle money and personal data, so this gets asked for eventually. Cheap to add early as a log, expensive to reconstruct later.

### Real but quieter (can slot in as v1 hardens)

- **Overdue notification pipeline.** The bell fires in-app only. Real overdue reminders go out by email or SMS on a schedule. This is a background-job concern, not a screen, so it is easy to miss until someone asks why patrons are not reminded.
- **Inventory / acquisition.** No receiving of new copies, no shelf reconciliation (the periodic "find what is actually missing" job). Probably skippable for v1, but skip it consciously.
- **Member communication history.** A notes field and a contact log on the member profile ("called about damaged book, left voicemail"). Small thing desk staff lean on constantly.

### Deliberately out of scope for v1

Listed so they read as decisions, not accidental omissions.

- Patron self-service (login, self-holds, online renewals). If this is ever needed it is a separate product surface, scoped on its own.
- Multi-branch and inter-location transfers
- Interlibrary loan
- Reading history and recommendations
- Cataloging standards (MARC records, ISBN lookup)

---

## Open question to resolve before the spec

What is this build for?

- **Portfolio piece / prototype:** the P0 core plus the settings decision and a basic audit log is enough.
- **System a real branch runs on:** also needs the notification pipeline, the rules layer as actual configuration, and inventory/acquisition.

The answer moves several items above between "must have" and "nice someday", so it should be settled first.
