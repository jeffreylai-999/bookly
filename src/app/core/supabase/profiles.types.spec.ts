import type { ProfilesClientUpdate } from './profiles.types';

/**
 * These assertions are compile-time, not runtime — the build is what fails.
 * They exist because the `role` exclusion is the only type-level protection
 * against a client patching its own role, and `pnpm supabase:types` rewrites
 * `database.types.ts` wholesale on every run.
 */
describe('ProfilesClientUpdate', () => {
  it('allows the columns a desk user may patch', () => {
    const patch: ProfilesClientUpdate = { full_name: 'Desk Staff', locale: 'en' };

    expect(patch.full_name).toBe('Desk Staff');
  });

  it('rejects role — the column GRANT keeps it immutable from a user JWT', () => {
    const patch = {
      full_name: 'Desk Staff',
      // @ts-expect-error role must never be client-updatable. If this directive
      // ever reports as unused, the exclusion has been lost — fix the type,
      // don't delete the directive.
      role: 'admin',
    } satisfies ProfilesClientUpdate;

    expect(patch.full_name).toBe('Desk Staff');
  });
});
