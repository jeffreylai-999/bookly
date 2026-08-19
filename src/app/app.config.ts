import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import {
  AlertCircle,
  Banknote,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Hand,
  Info,
  LayoutDashboard,
  LucideIconProvider,
  LUCIDE_ICONS,
  Plus,
  Repeat,
  ScanBarcode,
  Search,
  Settings,
  TriangleAlert,
  User,
  Users,
  X,
} from 'lucide-angular';

import { provideAuthInitializer, provideRouteFocusManagement } from './core/auth';
import { provideAppEcharts } from './core/echarts';
import { provideAppTransloco } from './core/i18n';
import { provideSupabaseClient } from './core/supabase';
import { routes } from './app.routes';

const icons = {
  AlertCircle,
  Banknote,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Hand,
  Info,
  LayoutDashboard,
  Plus,
  Repeat,
  ScanBarcode,
  Search,
  Settings,
  TriangleAlert,
  User,
  Users,
  X,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Owned here, not inside provideAppTransloco: the HTTP backend providers
    // are not `multi`, so two provideHttpClient calls silently fight.
    provideHttpClient(withFetch()),
    provideClientHydration(),
    provideAppTransloco(),
    provideAppEcharts(),
    provideSupabaseClient(),
    provideAuthInitializer(),
    provideRouteFocusManagement(),
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(icons) },
  ],
};
