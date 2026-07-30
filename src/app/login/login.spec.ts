import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslocoMissingHandler, TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';

import { AuthService } from '../core/auth';
import { ThrowingMissingKeyHandler } from '../core/i18n';
import en from '../../../public/i18n/en.json';
import { Login } from './login';

describe('Login', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Login,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        {
          provide: AuthService,
          useValue: {
            login: async () => ({ error: null }),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders the sign-in landmark and form controls', async () => {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('main#main-content')).not.toBeNull();
    expect(el.querySelector('h1')?.textContent).toContain('Sign in');
    expect(el.querySelector('input[type="email"]')).not.toBeNull();
    expect(el.querySelector('input[type="password"]')).not.toBeNull();
    expect(el.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it('reports no invalid state until a field is touched', async () => {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const emailInput = el.querySelector('input[type="email"]') as HTMLInputElement;

    // Required validators make the empty model invalid immediately; a screen
    // reader must not hear "invalid entry" on an untouched form, and there is
    // no error text for aria-describedby to point at yet either.
    expect(emailInput.getAttribute('aria-invalid')).toBeNull();
    expect(emailInput.getAttribute('aria-describedby')).toBeNull();

    emailInput.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(emailInput.getAttribute('aria-invalid')).toBe('true');
    expect(el.textContent).toContain('Email is required');
    expect(emailInput.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('distinguishes a malformed email from a missing one', async () => {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const emailInput = el.querySelector('input[type="email"]') as HTMLInputElement;

    emailInput.value = 'not-an-email';
    emailInput.dispatchEvent(new Event('input'));
    emailInput.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(el.textContent).toContain('Enter a valid email address');
  });

  it('has no serious AXE violations', async () => {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
