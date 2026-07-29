import { TestBed } from '@angular/core/testing';
import {
  provideTranslocoMissingHandler,
  TranslocoService,
  TranslocoTestingModule,
} from '@jsverse/transloco';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { LoudMissingKeyHandler } from './core/i18n';

const en = {
  app: {
    brand: 'Bookly',
    tagline: 'Library desk toolkit — foundation bootstrap',
    hint: 'Tailwind, CDK, Transloco, and typed Supabase clients are wired. Next: auth walking skeleton.',
  },
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        App,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en',
          },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        provideTranslocoMissingHandler(LoudMissingKeyHandler),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render Transloco English strings with Tailwind layout', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Library desk toolkit',
    );
    expect(compiled.querySelector('main')?.className).toContain('bg-canvas');
  });

  it('fails when a translation key is missing', () => {
    const transloco = TestBed.inject(TranslocoService);
    expect(() => transloco.translate('app.does_not_exist')).toThrowError(
      /Missing translation key/,
    );
  });
});
