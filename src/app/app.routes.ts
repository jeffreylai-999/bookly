import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
  {
    path: 'styleguide',
    loadComponent: () => import('./styleguide/styleguide').then((m) => m.Styleguide),
  },
];
