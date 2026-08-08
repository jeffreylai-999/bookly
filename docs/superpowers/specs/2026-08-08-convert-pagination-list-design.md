# Convert paginated list stores to `resource()`

## Scope

Convert the read paths in Audit, Catalog, Members, Fines, and Loans to the
`resource()` pattern established by Holds. Settings is excluded because it has
no paginated list read or `loadGeneration` state.

## Design

Each store will retain its existing public filter, pagination, and command APIs.
Its list read will publish request parameters to a `resource()` loader, including
a nonce so explicit refreshes can repeat identical requests. A `linkedSignal`
will preserve the previous list value while the next request is in flight.
Superseded reads will be handled by `resource()`, replacing manual
`loadGeneration` checks.

Store-specific reads remain separate from the list resource: Audit actors,
Catalog genres, Members member types, Fines summaries and payments, and Loans
renewal commands. Audit will continue to reject invalid date ranges before
requesting list data. Loans will keep its tab-specific repository calls.

A small shared pagination utility will provide:

- an empty-state predicate that returns false while loading or on error, and
  allows Audit to supply its invalid-date guard;
- a page-clamp operation that reloads page 1 when a settled result makes the
  selected page invalid.

All five stores will use the clamp after a list request settles. This adds the
missing behavior to Members, Fines, and Loans while replacing the copies in
Audit and Catalog.

## Testing

Each affected store spec will continue to test its filters and paging request
parameters. Resource conversions will test stale-read handling without manual
generation counters and preserve sticky rows while a newer query is pending.
Members, Fines, and Loans will gain page-clamp coverage. The focused specs,
full unit suite, and production build will be run before handoff.

## Out of scope

Settings and the Circulation/check-in command read flags are unchanged. No
generic store factory or caller migration is introduced.
