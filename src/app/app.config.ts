import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import {
  AlertCircle,
  Banknote,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hand,
  LayoutDashboard,
  LucideIconProvider,
  LUCIDE_ICONS,
  Plus,
  Repeat,
  Search,
  Settings,
  User,
  Users,
} from 'lucide-angular';

import { routes } from './app.routes';

const icons = {
  AlertCircle,
  Banknote,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hand,
  LayoutDashboard,
  Plus,
  Repeat,
  Search,
  Settings,
  User,
  Users,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(icons) },
  ],
};
