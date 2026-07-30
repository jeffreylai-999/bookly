import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField, email, required, submit } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService } from '../core/auth';
import { UiBtn, UiField } from '../ui';

interface LoginModel {
  email: string;
  password: string;
}

@Component({
  selector: 'app-login',
  imports: [FormField, TranslocoPipe, UiBtn, UiField],
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

        <form class="mt-8 flex flex-col gap-5" (submit)="onSubmit($event)" novalidate>
          <ui-field
            [label]="'auth.login.email' | transloco"
            [error]="emailError()"
            [required]="true"
            #emailField
          >
            <input
              type="email"
              autocomplete="username"
              [id]="emailField.controlId"
              [attr.aria-describedby]="emailField.describedBy()"
              [attr.aria-invalid]="emailError() ? true : null"
              [formField]="loginForm.email"
              class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
            />
          </ui-field>

          <ui-field
            [label]="'auth.login.password' | transloco"
            [error]="passwordError()"
            [required]="true"
            #passwordField
          >
            <input
              type="password"
              autocomplete="current-password"
              [id]="passwordField.controlId"
              [attr.aria-describedby]="passwordField.describedBy()"
              [attr.aria-invalid]="passwordError() ? true : null"
              [formField]="loginForm.password"
              class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
            />
          </ui-field>

          @if (formError(); as message) {
            <p role="alert" class="text-sm font-semibold text-danger">{{ message }}</p>
          }

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

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  private readonly model = signal<LoginModel>({ email: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.email, { message: 'required' });
    email(path.email, { message: 'email' });
    required(path.password, { message: 'required' });
  });

  protected emailError(): string | undefined {
    const field = this.loginForm.email();
    if (!field.touched() || !field.invalid()) {
      return undefined;
    }
    const kind = field.errors()[0]?.kind;
    return kind === 'email'
      ? this.transloco.translate('auth.login.errors.emailInvalid')
      : this.transloco.translate('auth.login.errors.emailRequired');
  }

  protected passwordError(): string | undefined {
    const field = this.loginForm.password();
    if (!field.touched() || !field.invalid()) {
      return undefined;
    }
    return this.transloco.translate('auth.login.errors.passwordRequired');
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.formError.set(null);

    const ok = await submit(this.loginForm, async () => {
      this.submitting.set(true);
      try {
        const { email, password } = this.model();
        const { error } = await this.auth.login(email, password);
        if (error === 'profile_unavailable') {
          this.formError.set(this.transloco.translate('auth.login.errors.unavailable'));
          return;
        }
        if (error) {
          this.formError.set(this.transloco.translate('auth.login.errors.failed'));
          return;
        }
        await this.router.navigateByUrl('/');
      } finally {
        this.submitting.set(false);
      }
    });

    if (!ok) {
      this.loginForm().markAsTouched();
    }
  }
}
