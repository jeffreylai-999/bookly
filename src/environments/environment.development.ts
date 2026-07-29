/**
 * Local development client config. Swapped in for `environment.ts` by the
 * `development` build/serve configuration (angular.json fileReplacements).
 */
export const environment = {
  production: false,
  supabase: {
    url: 'http://127.0.0.1:54321',
    /** Local Supabase demo anon key (`supabase status` → anon key). */
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  },
};
