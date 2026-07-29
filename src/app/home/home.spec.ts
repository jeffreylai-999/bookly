import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule, provideTranslocoMissingHandler } from '@jsverse/transloco';

import { Home } from './home';
import { ThrowingMissingKeyHandler } from '../core/i18n';
import en from '../../../public/i18n/en.json';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Home,
        // The shipped catalog, not a hand-copied fixture: a key renamed in
        // en.json but not in the template has to fail here.
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideTranslocoMissingHandler(ThrowingMissingKeyHandler)],
    }).compileComponents();
  });

  it('renders the English copy from the shipped catalog', async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('p')?.textContent).toContain(en.app.brand);
    expect(el.querySelector('h1')?.textContent).toContain(en.app.tagline);
    expect(el.textContent).toContain(en.app.hint);
  });

  it('is the only landmark and heading it contributes to a page', async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    // The hero used to live in the app shell, which put a second <main> and
    // <h1> on every routed page. It must not reintroduce either.
    expect(el.querySelectorAll('main').length).toBe(0);
    expect(el.querySelectorAll('h1').length).toBe(1);
  });
});
