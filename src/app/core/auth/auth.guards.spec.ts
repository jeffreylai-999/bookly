import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthService } from './auth.service';
import { adminGuard, authGuard, guestGuard } from './auth.guards';

@Component({ template: '' })
class Blank {}

class AuthStub {
  ready = Promise.resolve();
  authenticated = false;
  admin = false;

  ensureReady(): Promise<void> {
    return this.ready;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  isAdmin(): boolean {
    return this.admin;
  }
}

describe('auth guards', () => {
  let auth: AuthStub;

  beforeEach(() => {
    auth = new AuthStub();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', canActivate: [guestGuard], component: Blank },
          { path: '', canActivate: [authGuard], component: Blank },
          { path: 'settings', canActivate: [adminGuard], component: Blank },
          { path: 'audit', canActivate: [adminGuard], component: Blank },
        ]),
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  it('authGuard sends anonymous users to /login', async () => {
    auth.authenticated = false;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('guestGuard sends authenticated users to /', async () => {
    auth.authenticated = true;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('adminGuard blocks staff and sends them home', async () => {
    auth.authenticated = true;
    auth.admin = false;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/settings');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('adminGuard allows admins', async () => {
    auth.authenticated = true;
    auth.admin = true;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/settings');
    expect(TestBed.inject(Router).url).toBe('/settings');
  });

  it('adminGuard blocks staff from /audit', async () => {
    auth.authenticated = true;
    auth.admin = false;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/audit');
    expect(TestBed.inject(Router).url).toBe('/');
  });
});
