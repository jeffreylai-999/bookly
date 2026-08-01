import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../core/auth';
import { ScanService } from '../core/scan';
import { ToastService, UiLayout, UiSidebarNavItem, UiTopbar } from '../ui';

interface NavItem {
  icon: string;
  labelKey: string;
  link: string;
  exact?: boolean;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { icon: 'layout-dashboard', labelKey: 'nav.overview', link: '/', exact: true },
  { icon: 'repeat', labelKey: 'nav.circulation', link: '/circulation' },
  { icon: 'book-open', labelKey: 'nav.catalog', link: '/catalog' },
  { icon: 'users', labelKey: 'nav.members', link: '/members' },
  { icon: 'hand', labelKey: 'nav.holds', link: '/holds' },
  { icon: 'banknote', labelKey: 'nav.fines', link: '/fines' },
  { icon: 'bar-chart-3', labelKey: 'nav.reports', link: '/reports' },
  { icon: 'settings', labelKey: 'nav.settings', link: '/settings', adminOnly: true },
  { icon: 'book-marked', labelKey: 'nav.audit', link: '/audit', adminOnly: true },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, TranslocoPipe, UiLayout, UiSidebarNavItem, UiTopbar],
  template: `
    <ui-layout [skipLabel]="'shell.skip' | transloco">
      <div layout-sidebar class="flex h-full flex-col gap-1">
        <div class="mb-6 px-3 text-[17px] font-extrabold tracking-[-0.01em] text-white">
          {{ 'app.brand' | transloco }}
        </div>
        <nav class="flex flex-1 flex-col gap-1" [attr.aria-label]="'shell.nav' | transloco">
          @for (item of visibleNav(); track item.link) {
            <ui-sidebar-nav-item
              [icon]="item.icon"
              [label]="item.labelKey | transloco"
              [link]="item.link"
              [exact]="item.exact ?? false"
            />
          }
        </nav>
        <div class="mt-4 border-t border-white/[0.14] pt-4">
          <p class="px-3 text-xs text-white/[0.52]">{{ profileLabel() }}</p>
          <button
            type="button"
            class="mt-2 flex w-full cursor-pointer items-center gap-3 rounded-[10px] border-0 bg-transparent px-3 py-2.5 text-left text-sm font-semibold text-white/[0.68] transition-colors duration-100 hover:bg-white/[0.08] hover:text-white focus-ring-dark"
            (click)="signOut()"
          >
            {{ 'auth.logout' | transloco }}
          </button>
        </div>
      </div>

      <ui-topbar [pageTitle]="pageTitle()" [subtitle]="pageSubtitle()" />

      <router-outlet />
    </ui-layout>
  `,
})
export class AppShell implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly scan = inject(ScanService);

  ngOnInit(): void {
    this.scan.start();
  }

  ngOnDestroy(): void {
    this.scan.stop();
  }

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split('?')[0] ?? '/'),
      startWith(this.router.url.split('?')[0] ?? '/'),
    ),
    { initialValue: this.router.url.split('?')[0] ?? '/' },
  );

  protected readonly visibleNav = computed(() => {
    const admin = this.auth.isAdmin();
    return NAV_ITEMS.filter((item) => !item.adminOnly || admin);
  });

  protected readonly pageTitle = computed(() => {
    const url = this.currentUrl();
    const item = NAV_ITEMS.find((nav) =>
      nav.exact ? url === nav.link : url === nav.link || url.startsWith(`${nav.link}/`),
    );
    return item ? this.transloco.translate(item.labelKey) : this.transloco.translate('app.brand');
  });

  protected readonly pageSubtitle = computed(() => this.auth.profile()?.email ?? '');

  protected readonly profileLabel = computed(() => {
    const profile = this.auth.profile();
    if (!profile) {
      return '';
    }
    return `${profile.full_name} · ${profile.role}`;
  });

  protected async signOut(): Promise<void> {
    const { error } = await this.auth.logout();
    if (error) {
      this.toast.error(this.transloco.translate('auth.logoutFailed'));
      return;
    }
    this.toast.show(this.transloco.translate('auth.loggedOut'));
    await this.router.navigateByUrl('/login');
  }
}
