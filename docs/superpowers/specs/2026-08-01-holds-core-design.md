# Holds core — Design specification

**Date:** 2026-08-01  
**Status:** Approved for specification review  
**Issue:** [#7](https://github.com/jeffreylai-999/bookly/issues/7)

## Scope

Implement the staff-facing Holds core: placing, cancelling, and marking a hold ready,
plus a Holds queue page and Catalog's inline place-hold action. This slice follows the
approved dashboard design, glossary, and ADRs.

## Design decisions

- A hold belongs to a **title**, not a copy. A copy is assigned only when the queue
  head is marked ready.
- `place_hold`, `cancel_hold`, and `mark_ready` are `SECURITY DEFINER` RPCs. Direct
  authenticated writes to `holds` remain revoked.
- Queue order is server-enforced. `mark_ready` takes a copy barcode, locks the title,
  and promotes only the lowest-position `waiting` hold. The UI cannot choose a queue
  row to promote.
- `place_hold` locks the title and appends to its queue tail. It rejects inactive
  members, duplicate active holds, and members already borrowing a copy of the title.
- `cancel_hold` locks the title, marks its target cancelled, and atomically renumbers
  the remaining active queue positions without gaps.
- A partial unique index prevents duplicate `waiting`/`ready` holds for a
  member/title; a partial queue-position index prevents active queue collisions.
- Marking ready locks the selected available copy, changes it to `on_hold_shelf`,
  assigns it to the queue head, and sets expiry from that member type's hold-expiry
  policy. It emits the required audit and notification records.
- Checkout is updated to let a member check out their own `on_hold_shelf` copy, to
  fulfil their active hold when they receive another copy of the same title, and to
  release/promote the shelf copy where applicable.

## Frontend

- Add a lazy `/holds` feature following the repository → signal store → feature
  component pattern. It offers a status filter, result count, loading/error states,
  pagination, and a table of title, member, position, status, hold age, and ready
  expiry.
- Queue age is calculated from `created_at`; waiting holds do not expire. Ready-hold
  expiry remains visible.
- Each row provides cancellation behind a native-dialog confirmation. The page also
  provides a per-title mark-ready form that accepts an available-copy barcode.
- The Catalog table provides an inline place-hold action that opens a labelled
  member-selection form.
- All UI strings use feature-scoped Transloco keys. Rule-violation codes map to
  localized errors; success and failure feedback use the existing toast service.
- The UI uses Bookly's existing light admin tokens, outlined tables/cards, pill
  badges, focus ring, and Lucide icons. It retains keyboard-reachable controls,
  visible labels, table captions, semantic statuses, and clear filtered/unfiltered
  empty states.

## Testing

- SQL tests cover placement gates, cancellation renumbering, server-selected queue
  promotion, and concurrent placement uniqueness.
- Repository tests cover RPC parameters and typed error mapping.
- Store tests cover stale response protection, filters, and mutation refreshes.
- Component tests cover result count, age presentation, empty states, dialog
  interactions, and axe accessibility.
- The final verification runs relevant SQL tests with the local stack, the full
  Vitest suite, and the production build.

## Out of scope

- Hold expiry cron processing and check-in’s hold-fill branch.
- Patron self-service, queue skipping/defer, and external notifications.
