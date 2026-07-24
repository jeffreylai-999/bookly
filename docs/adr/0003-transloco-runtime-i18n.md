# Transloco runtime i18n over @angular/localize

All UI strings are Transloco translation keys from the first component onward; server-generated events (`notifications`, `audit_log.action`, RPC error codes) carry machine codes + data, never prose, and are rendered localized client-side.

`@angular/localize` was rejected because compile-time i18n produces one build and one SSR server bundle per locale — runtime switching (per-staff `profiles.locale`, single deploy) fits this app; a portfolio project cannot justify a bundle matrix. The choice is effectively irreversible in practice: retrofitting keys into hardcoded strings — or migrating key-based templates to `i18n` attributes — is the expensive path, which is why keys are mandatory from day one even though v1 ships English only.
