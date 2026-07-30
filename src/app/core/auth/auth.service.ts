import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, PLATFORM_ID, Service, computed, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';

import { SUPABASE_CLIENT } from '../supabase';
import type { AuthProfile, AuthStatus } from './auth.types';

type ProfileLoad = { kind: 'ok'; profile: AuthProfile } | { kind: 'missing' } | { kind: 'error' };

/**
 * Closed union on purpose. An `| string` arm would collapse it back to `string`
 * and buy no type safety, and no caller renders the provider's message — the
 * login form maps each case to its own translated copy.
 */
export type LoginError = 'credentials' | 'profile_missing' | 'profile_unavailable' | 'unexpected';

@Service()
export class AuthService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  private readonly sessionState = signal<Session | null>(null);
  private readonly profileState = signal<AuthProfile | null>(null);
  private readonly statusState = signal<AuthStatus>('unknown');
  private ready: Promise<void> | null = null;
  private listening = false;
  /** Bumped in clearAuth so in-flight applySession awaits are ignored. */
  private generation = 0;

  readonly session = this.sessionState.asReadonly();
  readonly profile = this.profileState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly role = computed(() => this.profileState()?.role ?? null);
  readonly isAuthenticated = computed(() => this.statusState() === 'authenticated');
  readonly isAdmin = computed(() => this.profileState()?.role === 'admin');

  /**
   * Idempotent bootstrap for guards / shell. Failures fail closed to anonymous
   * and clear the memo so a later call can retry (offline → online).
   */
  ensureReady(): Promise<void> {
    if (this.ready) {
      return this.ready;
    }
    this.ready = this.bootstrap().catch(() => {
      this.clearAuth();
      this.ready = null;
      this.listenForBrowserAuthChanges();
    });
    return this.ready;
  }

  async login(email: string, password: string): Promise<{ error: LoginError | null }> {
    await this.ensureReady();
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // `code` is the stable branch point; `message` is prose that can change.
      return { error: error.code === 'invalid_credentials' ? 'credentials' : 'unexpected' };
    }
    const outcome = await this.applySession(data.session, this.generation);
    if (outcome.kind === 'ok' && this.isAuthenticated()) {
      return { error: null };
    }
    if (outcome.kind === 'error') {
      return { error: 'profile_unavailable' };
    }
    // missing / no session — not a desk user
    await this.supabase.auth.signOut();
    this.clearAuth();
    return { error: 'profile_missing' };
  }

  async logout(): Promise<{ error: string | null }> {
    await this.ensureReady();
    const { error } = await this.supabase.auth.signOut();
    if (error) {
      return { error: error.message };
    }
    this.clearAuth();
    return { error: null };
  }

  private async bootstrap(): Promise<void> {
    try {
      const { data, error } = await this.supabase.auth.getUser();
      if (error || !data.user) {
        this.clearAuth();
      } else {
        const { data: sessionData } = await this.supabase.auth.getSession();
        await this.applySession(sessionData.session, this.generation);
      }
    } finally {
      this.listenForBrowserAuthChanges();
    }
  }

  private listenForBrowserAuthChanges(): void {
    if (this.listening || !isPlatformBrowser(this.platformId)) {
      return;
    }
    this.listening = true;
    const { data } = this.supabase.auth.onAuthStateChange((_event, session) => {
      void this.applySession(session, this.generation);
    });
    this.destroyRef.onDestroy(() => data.subscription.unsubscribe());
  }

  private async applySession(
    session: Session | null,
    generation: number,
  ): Promise<ProfileLoad | { kind: 'cleared' }> {
    if (!session?.user) {
      if (generation !== this.generation) {
        return { kind: 'cleared' };
      }
      this.clearAuth();
      return { kind: 'cleared' };
    }

    const result = await this.loadProfile(session.user.id);
    if (generation !== this.generation) {
      return { kind: 'cleared' };
    }

    if (result.kind === 'error') {
      // Keep an established session on a blip; first load must fail closed + retry.
      if (this.statusState() === 'unknown') {
        this.clearAuth();
        this.ready = null;
      }
      return result;
    }
    if (result.kind === 'missing') {
      this.clearAuth();
      return result;
    }

    this.profileState.set(result.profile);
    this.sessionState.set(session);
    this.statusState.set('authenticated');
    return result;
  }

  private async loadProfile(userId: string): Promise<ProfileLoad> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, full_name, email, role, locale')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        return { kind: 'error' };
      }
      if (!data) {
        return { kind: 'missing' };
      }
      return { kind: 'ok', profile: data };
    } catch {
      return { kind: 'error' };
    }
  }

  private clearAuth(): void {
    this.generation += 1;
    this.sessionState.set(null);
    this.profileState.set(null);
    this.statusState.set('anonymous');
  }
}
