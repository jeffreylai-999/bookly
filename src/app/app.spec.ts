import { TestBed } from '@angular/core/testing';
import {
  provideTranslocoMissingHandler,
  TranslocoService,
  TranslocoTestingModule,
} from '@jsverse/transloco';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { ThrowingMissingKeyHandler } from './core/i18n';
import en from '../../public/i18n/en.json';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        App,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        // Must come after the TranslocoTestingModule import: that module
        // provides TRANSLOCO_MISSING_HANDLER itself via provideTransloco.
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('is a bare shell, so routed pages own their own landmarks', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('router-outlet')).not.toBeNull();
    expect(el.querySelectorAll('main').length).toBe(0);
    expect(el.querySelectorAll('h1').length).toBe(0);
  });

  it('fails when a translation key is missing', () => {
    const transloco = TestBed.inject(TranslocoService);
    expect(() => transloco.translate('app.does_not_exist')).toThrowError(/Missing translation key/);
  });
});
