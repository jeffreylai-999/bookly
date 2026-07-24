# Overdue is derived, never stored

There is no `overdue` value in any status enum. A loan is overdue iff `due_at < now() AND returned_at IS NULL`, and the `overdue_loans` view (loans × members × member_types, exposing `days_late` in library-local calendar days and `projected_fine`) is the single source of that formula — Circulation's overdue tab, the Overview widgets, and the check-in fine calculation all read the same view.

A stored status was rejected because it requires a scheduled job to flip rows and can therefore be stale or wrong (renewals move `due_at`; timezone edits move the day boundary); a derived predicate is correct at every read with no sweeper. Do not "add the missing status" — anything that needs overdue reads the view. The fine amount is finalized (and rule-snapshotted) only at check-in, at the rate in force at that moment; `projected_fine` before that is informational and never gates anything.
