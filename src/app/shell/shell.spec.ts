import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterOutlet } from '@angular/router';
import {
  provideTranslocoMissingHandler,
  TranslocoTestingModule,
} from '@jsverse/transloco';
import axe from 'axe-core';
import {
  Banknote,
  BarChart3,
  BookMarked,
  BookOpen,
  Hand,
  LayoutDashboard,
  LucideIconProvider,
  LUCIDE_ICONS,
  Repeat,
  Settings,
  Users,
} from 'lucide-angular';

import { AuthService } from '../core/auth';
import { ThrowingMissingKeyHandler } from '../core/i18n';
import { ScanService } from '../core/scan';
import en from '../../../public/i18n/en.json';
import { AppShell } from './shell';

@Component({
  selector: 'app-outlet-stub',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
class OutletStub {}

class AuthStub {
  profile = () => ({
    id: '1',
    full_name: 'Desk Staff',
    email: 'staff@bookly.local',
    role: 'staff' as const,
    locale: 'en',
  });
  isAdmin = () => false;
  logout = async () => ({ error: null });
}

const icons = {
  provide: LUCIDE_ICONS,
  multi: true,
  useValue: new LucideIconProvider({
    Banknote,
    BarChart3,
    BookMarked,
    BookOpen,
    Hand,
    LayoutDashboard,
    Repeat,
    Settings,
    Users,
  }),
};

describe('AppShell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AppShell,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([{ path: '', component: OutletStub }]),
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: AuthService, useClass: AuthStub },
        { provide: ScanService, useValue: { start: () => undefined, stop: () => undefined } },
        icons,
      ],
    }).compileComponents();
  });

  it('hides admin nav items for staff', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Overview');
    expect(text).toContain('Circulation');
    expect(text).not.toContain('Settings');
    expect(text).not.toContain('Audit');
  });

  it('shows admin nav items for admins', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        AppShell,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([{ path: '', component: OutletStub }]),
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        {
          provide: AuthService,
          useValue: {
            profile: () => ({
              id: '2',
              full_name: 'Library Admin',
              email: 'admin@bookly.local',
              role: 'admin',
              locale: 'en',
            }),
            isAdmin: () => true,
            logout: async () => ({ error: null }),
          },
        },
        { provide: ScanService, useValue: { start: () => undefined, stop: () => undefined } },
        icons,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Settings');
    expect(text).toContain('Audit');
  });

  it('has no serious AXE violations for staff shell', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
