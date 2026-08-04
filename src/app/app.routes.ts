import { Routes } from '@angular/router';

import { adminGuard, authGuard, guestGuard } from './core/auth';

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
      {
        path: 'members/:id',
        loadComponent: () => import('./members/member-detail').then((m) => m.MemberDetail),
      },
      {
        path: 'holds',
        loadComponent: () => import('./holds/holds').then((m) => m.Holds),
        data: { titleKey: 'nav.holds' },
      },
      {
        path: 'fines',
        loadComponent: () => import('./fines/fines-list').then((m) => m.FinesList),
        data: { titleKey: 'nav.fines' },
      },
      {
        path: 'reports',
        loadComponent: () => import('./reports/reports').then((m) => m.Reports),
        data: { titleKey: 'nav.reports' },
      },
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
