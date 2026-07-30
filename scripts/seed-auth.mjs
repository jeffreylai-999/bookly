#!/usr/bin/env node
/**
 * Creates one staff + one admin auth user with matching profiles.
 *
 * Local env only. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (from `pnpm exec supabase status` after `pnpm supabase:start`).
 * Never put the service-role key in Angular code or committed config.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-auth.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example → .env and add the service-role key from `supabase status`.',
  );
  process.exit(1);
}

if (serviceRoleKey.includes('anon') || serviceRoleKey.length < 40) {
  console.error('SUPABASE_SERVICE_ROLE_KEY does not look like a service-role key. Refusing to continue.');
  process.exit(1);
}

/** @type {import('@supabase/supabase-js').SupabaseClient} */
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_USERS = [
  {
    email: 'staff@bookly.local',
    password: 'bookly-staff-demo',
    full_name: 'Desk Staff',
    role: 'staff',
    locale: 'en',
  },
  {
    email: 'admin@bookly.local',
    password: 'bookly-admin-demo',
    full_name: 'Library Admin',
    role: 'admin',
    locale: 'en',
  },
];

/**
 * @param {typeof SEED_USERS[number]} user
 */
async function upsertAuthUser(user) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) throw listed.error;

  const existing = listed.data.users.find((u) => u.email === user.email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
    });
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.full_name },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  for (const user of SEED_USERS) {
    const id = await upsertAuthUser(user);
    const { error } = await admin.from('profiles').upsert(
      {
        id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        locale: user.locale,
      },
      { onConflict: 'id' },
    );
    if (error) throw error;
    console.log(`Seeded ${user.role}: ${user.email}`);
  }
  console.log('Done. Demo passwords are in scripts/seed-auth.mjs (local only).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
