import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField, email, required, submit } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService, type LoginError } from '../core/auth';
import { ToastService, UiBtn, UiField } from '../ui';

interface LoginModel {
  email: string;
  password: string;
}

/**
 * Exhaustive by type: adding a `LoginError` member without copy for it is a
 * compile error rather than a silently generic message.
 */
const LOGIN_ERROR_KEYS: Record<LoginError, string> = {
  credentials: 'auth.login.errors.failed',
  profile_missing: 'auth.login.errors.failed',
  profile_unavailable: 'auth.login.errors.unavailable',
  unexpected: 'auth.login.errors.unexpected',
};

@Component({
  selector: 'app-login',
  imports: [FormField, LucideAngularModule, TranslocoPipe, UiBtn, UiField],
  template: `
    <main
      id="main-content"
      tabindex="-1"
      class="flex min-h-dvh items-center justify-center bg-canvas px-6 py-12 text-ink focus:outline-none"
    >
      <div class="w-full max-w-md rounded-card border border-line bg-surface p-8 shadow-tab">
        <p class="text-sm font-medium uppercase tracking-[0.14em] text-brand">
          {{ 'app.brand' | transloco }}
        </p>
        <h1 class="mt-3 text-3xl font-extrabold tracking-tight text-ink-heading">
          {{ 'auth.login.title' | transloco }}
        </h1>
        <p class="mt-2 text-sm text-ink-muted">{{ 'auth.login.subtitle' | transloco }}</p>

        <form class="mt-8 flex flex-col gap-3" (submit)="onSubmit($event)" novalidate>
          <!--
            The error signals hold i18n keys, not text — the pipe resolves them
            so a catalog that lands after first paint still renders, and a lang
            switch re-renders. Translating inside the computed would latch the
            value read on the first evaluation.
          -->
          @let emailKey = emailErrorKey();
          @let emailErrorText = emailKey ? (emailKey | transloco) : undefined;
          @let passwordKey = passwordErrorKey();
          @let passwordErrorText = passwordKey ? (passwordKey | transloco) : undefined;

          <ui-field
            [label]="'auth.login.email' | transloco"
            [error]="emailErrorText"
            [required]="true"
            #emailField
          >
            <input
              type="email"
              autocomplete="username"
              [id]="emailField.controlId"
              [attr.aria-describedby]="emailField.describedBy()"
              [attr.aria-invalid]="emailErrorText ? true : null"
              [formField]="loginForm.email"
              class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
            />
          </ui-field>

          <ui-field
            [label]="'auth.login.password' | transloco"
            [error]="passwordErrorText"
            [required]="true"
            #passwordField
          >
            <div class="relative">
              <input
                [type]="passwordVisible() ? 'text' : 'password'"
                autocomplete="current-password"
                [id]="passwordField.controlId"
                [attr.aria-describedby]="passwordField.describedBy()"
                [attr.aria-invalid]="passwordErrorText ? true : null"
                [formField]="loginForm.password"
                class="w-full rounded-lg border border-line bg-surface py-2.5 pl-3.5 pr-11 text-sm text-ink focus-ring focus:border-brand"
              />
              <button
                type="button"
                class="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-ink-muted transition-colors duration-100 hover:bg-control-hover hover:text-ink-soft focus-ring"
                [attr.aria-label]="
                  (passwordVisible() ? 'auth.login.hidePassword' : 'auth.login.showPassword')
                    | transloco
                "
                [attr.aria-pressed]="passwordVisible()"
                (click)="passwordVisible.update((visible) => !visible)"
              >
                <lucide-angular
                  [name]="passwordVisible() ? 'eye-off' : 'eye'"
                  [size]="16"
                  [strokeWidth]="1.75"
                  aria-hidden="true"
                />
              </button>
            </div>
          </ui-field>

          <button
            uiBtn
            type="submit"
            class="w-full"
            [disabled]="submitting() || loginForm().invalid()"
          >
            {{
              submitting()
                ? ('auth.login.submitting' | transloco)
                : ('auth.login.submit' | transloco)
            }}
          </button>
        </form>
      </div>
    </main>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  protected readonly submitting = signal(false);
  protected readonly passwordVisible = signal(false);

  private readonly model = signal<LoginModel>({ email: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.email);
    email(path.email);
    required(path.password);
  });

  /**
   * Gated on `touched()` so an untouched empty form announces nothing — the
   * template drives `aria-invalid` off the same signal, keeping the visible
   * message and the a11y state in step.
   */
  protected readonly emailErrorKey = computed(() => {
    const field = this.loginForm.email();
    if (!field.touched() || !field.invalid()) {
      return undefined;
    }
    return field.getError('email')
      ? 'auth.login.errors.emailInvalid'
      : 'auth.login.errors.emailRequired';
  });

  protected readonly passwordErrorKey = computed(() => {
    const field = this.loginForm.password();
    if (!field.touched() || !field.invalid()) {
      return undefined;
    }
    return 'auth.login.errors.passwordRequired';
  });

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    // `submit()` marks the form touched itself before checking validity, so
    // there is nothing to do with its return value here.
    await submit(this.loginForm, async () => {
      this.submitting.set(true);
      try {
        const { email, password } = this.model();
        const { error } = await this.auth.login(email, password);
        if (error) {
          this.toast.error(this.transloco.translate(LOGIN_ERROR_KEYS[error]));
          return;
        }
        await this.router.navigateByUrl('/');
      } finally {
        this.submitting.set(false);
      }
    });
  }
}
