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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Hand,
  LayoutDashboard,
  LucideIconProvider,
  LUCIDE_ICONS,
  Plus,
  Repeat,
  ScanBarcode,
  Search,
  Settings,
  User,
  Users,
  X,
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Hand,
  LayoutDashboard,
  Plus,
  Repeat,
  ScanBarcode,
  Search,
  Settings,
  User,
  Users,
  X,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(icons) },
  ],
};
