import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LUCIDE_ICONS, LucideIconProvider, BookOpen, Users } from 'lucide-angular';
import { UiLayout } from './layout';
import { UiTopbar } from './topbar';
import { UiSidebarNavItem } from './sidebar-nav-item';

@Component({
  imports: [UiLayout, UiTopbar, UiSidebarNavItem],
  template: `
    <ui-layout>
      <div layout-sidebar>
        <ui-sidebar-nav-item
          icon="book-open"
          label="Catalog"
          [active]="true"
          (activate)="hits = hits + 1"
        />
      </div>
      <ui-topbar pageTitle="Catalog" subtitle="1,204 titles"><button>Add title</button></ui-topbar>
      <p>page body</p>
    </ui-layout>
  `,
})
class Host {
  hits = 0;
}

@Component({
  imports: [UiLayout, UiSidebarNavItem],
  template: `
    <ui-layout>
      <div layout-sidebar>
        <ui-sidebar-nav-item icon="book-open" label="Catalog" link="/catalog" />
        <ui-sidebar-nav-item icon="users" label="Members" link="/members" />
      </div>
    </ui-layout>
  `,
})
class RoutedHost {}

const icons = {
  provide: LUCIDE_ICONS,
  multi: true,
  useValue: new LucideIconProvider({ BookOpen, Users }),
};

describe('UiLayout shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [icons],
    }).compileComponents();
  });

  it('projects sidebar, topbar and content; nav item is active and clickable', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('aside')?.textContent).toContain('Catalog');
    expect(el.querySelector('h1')?.textContent).toContain('Catalog');
    expect(el.textContent).toContain('1,204 titles');
    expect(el.querySelector('main')?.textContent).toContain('page body');
    const nav = el.querySelector('ui-sidebar-nav-item button') as HTMLButtonElement;
    expect(nav.getAttribute('aria-current')).toBe('page');
    nav.click();
    expect(fixture.componentInstance.hits).toBe(1);
  });

  it('offers a skip link ahead of the sidebar that targets a focusable main', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const skip = el.querySelector('a') as HTMLAnchorElement;
    expect(skip.textContent?.trim()).toBe('Skip to main content');
    // Must precede the sidebar in the DOM or it saves nobody any tab stops.
    expect(skip.compareDocumentPosition(el.querySelector('aside') as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // Visible only on focus.
    expect(skip.className).toContain('sr-only');
    expect(skip.className).toContain('focus:not-sr-only');

    const main = el.querySelector('main') as HTMLElement;
    expect(skip.getAttribute('href')).toBe(`#${main.id}`);
    // Without tabindex the fragment scrolls but never moves focus.
    expect(main.getAttribute('tabindex')).toBe('-1');
  });
});

describe('UiSidebarNavItem as navigation', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoutedHost],
      providers: [
        icons,
        provideRouter([
          { path: 'catalog', component: RoutedHost },
          { path: 'members', component: RoutedHost },
        ]),
      ],
    }).compileComponents();
  });

  it('renders a real anchor so the link can be opened in a new tab', async () => {
    const harness = await RouterTestingHarness.create('/catalog');
    const el = harness.routeNativeElement as HTMLElement;
    const links = el.querySelectorAll('ui-sidebar-nav-item a');
    expect(links.length).toBe(2);
    expect(el.querySelectorAll('ui-sidebar-nav-item button').length).toBe(0);
    expect(links[0].getAttribute('href')).toBe('/catalog');
  });

  it('marks the current route from the router rather than a passed-in flag', async () => {
    const harness = await RouterTestingHarness.create('/catalog');
    harness.detectChanges();
    let links = (harness.routeNativeElement as HTMLElement).querySelectorAll(
      'ui-sidebar-nav-item a',
    );
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[1].getAttribute('aria-current')).toBeNull();

    await harness.navigateByUrl('/members');
    harness.detectChanges();
    links = (harness.routeNativeElement as HTMLElement).querySelectorAll('ui-sidebar-nav-item a');
    expect(links[0].getAttribute('aria-current')).toBeNull();
    expect(links[1].getAttribute('aria-current')).toBe('page');
  });
});
