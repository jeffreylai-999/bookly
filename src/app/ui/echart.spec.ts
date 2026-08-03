import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { EChartsCoreOption } from 'echarts/core';

import { provideAppEcharts } from '../core/echarts';
import { UiEcharts } from './echart';

@Component({
  imports: [UiEcharts],
  template: `<ui-echart [options]="options" chartLabel="Checkouts per day" height="200px" />`,
})
class Host {
  options: EChartsCoreOption = { series: [{ type: 'bar', data: [1, 2, 3] }] };
}

describe('UiEcharts', () => {
  // jsdom does not implement ResizeObserver; ngx-echarts constructs one
  // unconditionally when `autoResize` (default true) is on.
  beforeAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  });

  it('renders a fixed-height placeholder on the server, with no echarts host', async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    }).compileComponents();

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[echarts]')).toBeNull();
    const placeholder = el.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(placeholder).not.toBeNull();
    expect(placeholder.style.height).toBe('200px');
  });

  it('renders the echarts host with an accessible label in the browser', async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideAppEcharts(), { provide: PLATFORM_ID, useValue: 'browser' }],
    }).compileComponents();

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const chart = el.querySelector('[echarts]') as HTMLElement;
    expect(chart).not.toBeNull();
    expect(chart.getAttribute('role')).toBe('img');
    expect(chart.getAttribute('aria-label')).toBe('Checkouts per day');
    expect(chart.style.height).toBe('200px');
  });
});
