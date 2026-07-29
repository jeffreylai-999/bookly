/**
 * Production client config (public values only).
 * The service-role key must never appear here or in any Angular bundle.
 *
 * Replace `url` / `anonKey` before deploying. Local development uses
 * `environment.development.ts` via angular.json fileReplacements.
 *
 * `.env` / `.env.example` are for Node tooling (seed scripts, Supabase CLI) —
 * the Angular app does not read them.
 */
export const environment = {
  production: true,
  supabase: {
    url: 'https://dxcovzyibmohnpwbwebp.supabase.co',
    anonKey: 'sb_publishable_wdUie3Wwf8WezjvcNUoxHg_lu1x_bIk',
  },
};
