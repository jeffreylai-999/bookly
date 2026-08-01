import { Routes } from '@angular/router';

import { adminGuard, authGuard, guestGuard } from './core/auth';
import { ComingSoon } from './shell/coming-soon';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
  {
    path: 'styleguide',
    canActivate: [authGuard],
    loadComponent: () => import('./styleguide/styleguide').then((m) => m.Styleguide),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell').then((m) => m.AppShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./overview/overview').then((m) => m.Overview),
      },
      {
        path: 'circulation',
        loadComponent: () =>
          import('./circulation/circulation-desk').then((m) => m.CirculationDesk),
      },
      { path: 'catalog', loadComponent: () => import('./catalog/catalog').then((m) => m.Catalog) },
      {
        path: 'members',
        loadComponent: () => import('./members/members-list').then((m) => m.MembersList),
      },
      { path: 'holds', component: ComingSoon, data: { titleKey: 'nav.holds' } },
      {
        path: 'fines',
        loadComponent: () => import('./fines/fines-list').then((m) => m.FinesList),
        data: { titleKey: 'nav.fines' },
      },
      { path: 'reports', component: ComingSoon, data: { titleKey: 'nav.reports' } },
      {
        path: 'settings',
        canActivate: [adminGuard],
        loadComponent: () => import('./settings/settings').then((m) => m.Settings),
        data: { titleKey: 'nav.settings' },
      },
      {
        path: 'audit',
        canActivate: [adminGuard],
        loadComponent: () => import('./audit/audit-viewer').then((m) => m.AuditViewer),
        data: { titleKey: 'nav.audit' },
      },
    ],
  },
];
