import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';

import { SUPABASE_CLIENT } from '../supabase';
import { AuthService } from './auth.service';

function createMockClient(
  overrides: {
    getUser?: () => Promise<{
      data: { user: { id: string } | null };
      error: null | { message: string };
    }>;
    getSession?: () => Promise<{ data: { session: unknown } }>;
    signInWithPassword?: (args: unknown) => Promise<{
      data: { session: unknown };
      error: null | { message: string };
    }>;
    signOut?: () => Promise<{ error: null | { message: string } }>;
    profile?: unknown;
    profileError?: { message: string } | null;
    onAuthStateChange?: () => { data: { subscription: { unsubscribe: () => void } } };
    maybeSingle?: () => Promise<{ data: unknown; error: null | { message: string } }>;
  } = {},
) {
  return {
    auth: {
      getUser: overrides.getUser ?? (async () => ({ data: { user: null }, error: null })),
      getSession: overrides.getSession ?? (async () => ({ data: { session: null } })),
      signInWithPassword:
        overrides.signInWithPassword ??
        (async () => ({ data: { session: null }, error: { message: 'fail' } })),
      signOut: overrides.signOut ?? (async () => ({ error: null })),
      onAuthStateChange:
        overrides.onAuthStateChange ??
        (() => ({ data: { subscription: { unsubscribe: () => undefined } } })),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle:
            overrides.maybeSingle ??
            (async () => ({
              data: overrides.profile ?? null,
              error: overrides.profileError ?? null,
            })),
        }),
      }),
    }),
  };
}

type AuthInternals = {
  applySession: (s: unknown, g: number) => Promise<unknown>;
  generation: number;
};

describe('AuthService', () => {
  it('treats a missing user as anonymous', async () => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: SUPABASE_CLIENT, useValue: createMockClient() },
      ],
    });

    const auth = TestBed.inject(AuthService);
    await auth.ensureReady();

    expect(auth.status()).toBe('anonymous');
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.profile()).toBeNull();
  });

  it('loads the profile and marks authenticated when a session exists', async () => {
    const profile = {
      id: 'user-1',
      full_name: 'Desk Staff',
      email: 'staff@bookly.local',
      role: 'staff' as const,
      locale: 'en',
    };
    const session = { user: { id: 'user-1' } };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: SUPABASE_CLIENT,
          useValue: createMockClient({
            getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
            getSession: async () => ({ data: { session } }),
            profile,
          }),
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    await auth.ensureReady();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.isAdmin()).toBe(false);
    expect(auth.profile()).toEqual(profile);
  });

  it('login applies the new session and profile', async () => {
    const profile = {
      id: 'admin-1',
      full_name: 'Library Admin',
      email: 'admin@bookly.local',
      role: 'admin' as const,
      locale: 'en',
    };
    const session = { user: { id: 'admin-1' } };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: SUPABASE_CLIENT,
          useValue: createMockClient({
            signInWithPassword: async () => ({ data: { session }, error: null }),
            profile,
          }),
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    const result = await auth.login('admin@bookly.local', 'secret');

    expect(result.error).toBeNull();
    expect(auth.isAdmin()).toBe(true);
    expect(auth.profile()?.email).toBe('admin@bookly.local');
  });

  it('login fails closed when the profile row is missing', async () => {
    const session = { user: { id: 'orphan-1' } };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: SUPABASE_CLIENT,
          useValue: createMockClient({
            signInWithPassword: async () => ({ data: { session }, error: null }),
            profile: null,
          }),
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    const result = await auth.login('orphan@bookly.local', 'secret');

    expect(result.error).toBe('profile_missing');
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.session()).toBeNull();
  });

  it('login reports profile_unavailable on a transient profile error', async () => {
    const session = { user: { id: 'user-1' } };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: SUPABASE_CLIENT,
          useValue: createMockClient({
            signInWithPassword: async () => ({ data: { session }, error: null }),
            profileError: { message: 'timeout' },
          }),
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    const result = await auth.login('staff@bookly.local', 'secret');

    expect(result.error).toBe('profile_unavailable');
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('ensureReady fails closed when getUser throws and allows retry', async () => {
    let calls = 0;
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: SUPABASE_CLIENT,
          useValue: createMockClient({
            getUser: async () => {
              calls += 1;
              if (calls === 1) {
                throw new Error('network down');
              }
              return { data: { user: null }, error: null };
            },
          }),
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    await auth.ensureReady();
    expect(auth.status()).toBe('anonymous');

    await auth.ensureReady();
    expect(calls).toBe(2);
  });

  it('bootstrap profile error fails closed and allows ensureReady retry', async () => {
    const session = { user: { id: 'user-1' } };
    let profileCalls = 0;
    const profile = {
      id: 'user-1',
      full_name: 'Desk Staff',
      email: 'staff@bookly.local',
      role: 'staff' as const,
      locale: 'en',
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: SUPABASE_CLIENT,
          useValue: createMockClient({
            getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
            getSession: async () => ({ data: { session } }),
            maybeSingle: async () => {
              profileCalls += 1;
              if (profileCalls === 1) {
                return { data: null, error: { message: 'timeout' } };
              }
              return { data: profile, error: null };
            },
          }),
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    await auth.ensureReady();
    expect(auth.status()).toBe('anonymous');
    expect(auth.isAuthenticated()).toBe(false);

    await auth.ensureReady();
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.profile()).toEqual(profile);
  });

  it('keeps an authenticated session when profile reload errors', async () => {
    const profile = {
      id: 'user-1',
      full_name: 'Desk Staff',
      email: 'staff@bookly.local',
      role: 'staff' as const,
      locale: 'en',
    };
    const session = { user: { id: 'user-1' } };
    let profileCalls = 0;

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: SUPABASE_CLIENT,
          useValue: createMockClient({
            getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
            getSession: async () => ({ data: { session } }),
            maybeSingle: async () => {
              profileCalls += 1;
              if (profileCalls === 1) {
                return { data: profile, error: null };
              }
              return { data: null, error: { message: 'timeout' } };
            },
          }),
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    await auth.ensureReady();
    expect(auth.isAuthenticated()).toBe(true);

    const internals = auth as unknown as AuthInternals;
    await internals.applySession(session, internals.generation);

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.profile()).toEqual(profile);
  });

  it('logout leaves state alone when signOut fails', async () => {
    const profile = {
      id: 'user-1',
      full_name: 'Desk Staff',
      email: 'staff@bookly.local',
      role: 'staff' as const,
      locale: 'en',
    };
    const session = { user: { id: 'user-1' } };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: SUPABASE_CLIENT,
          useValue: createMockClient({
            getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
            getSession: async () => ({ data: { session } }),
            profile,
            signOut: async () => ({ error: { message: 'offline' } }),
          }),
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    await auth.ensureReady();
    const result = await auth.logout();

    expect(result.error).toBe('offline');
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('ignores stale applySession after clearAuth bumps generation', async () => {
    const profile = {
      id: 'user-1',
      full_name: 'Desk Staff',
      email: 'staff@bookly.local',
      role: 'staff' as const,
      locale: 'en',
    };
    const session = { user: { id: 'user-1' } };
    let releaseProfile!: () => void;
    const profileGate = new Promise<void>((resolve) => {
      releaseProfile = resolve;
    });
    let profileCalls = 0;

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: SUPABASE_CLIENT,
          useValue: createMockClient({
            getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
            getSession: async () => ({ data: { session } }),
            maybeSingle: async () => {
              profileCalls += 1;
              if (profileCalls === 1) {
                return { data: profile, error: null };
              }
              await profileGate;
              return { data: profile, error: null };
            },
            signOut: async () => ({ error: null }),
          }),
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    await auth.ensureReady();
    expect(auth.isAuthenticated()).toBe(true);

    const internals = auth as unknown as AuthInternals;
    const gen = internals.generation;
    const apply = internals.applySession(session, gen);
    const logout = auth.logout();
    releaseProfile();
    await Promise.all([apply, logout]);

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.session()).toBeNull();
  });
});
