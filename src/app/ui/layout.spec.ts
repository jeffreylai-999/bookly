import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LUCIDE_ICONS, LucideIconProvider, BookOpen } from 'lucide-angular';
import { UiLayout } from './layout';
import { UiTopbar } from './topbar';
import { UiSidebarNavItem } from './sidebar-nav-item';

@Component({
  imports: [UiLayout, UiTopbar, UiSidebarNavItem],
  template: `
    <ui-layout>
      <div layout-sidebar>
        <ui-sidebar-nav-item icon="book-open" label="Catalog" [active]="true" (activate)="hits = hits + 1" />
      </div>
      <ui-topbar pageTitle="Catalog" subtitle="1,204 titles"><button>Add title</button></ui-topbar>
      <p>page body</p>
    </ui-layout>
  `,
})
class Host {
  hits = 0;
}

describe('UiLayout shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ BookOpen }) }],
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
});
