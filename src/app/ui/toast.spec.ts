import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  AlertCircle,
  Check,
  Info,
  LUCIDE_ICONS,
  LucideIconProvider,
  TriangleAlert,
  X,
} from 'lucide-angular';
import { vi } from 'vitest';
import { ToastService, UiToastHost } from './toast';

describe('ToastService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
  });
  afterEach(() => vi.useRealTimers());

  it('shows and auto-dismisses after 2200ms', () => {
    const svc = TestBed.inject(ToastService);
    svc.show('Checked in');
    expect(svc.toasts().map((t) => t.details)).toEqual(['Checked in']);
    expect(svc.toasts()[0].type).toBe('success');
    vi.advanceTimersByTime(2199);
    expect(svc.toasts().length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(svc.toasts().length).toBe(0);
  });

  it('stacks multiple toasts with unique ids', () => {
    const svc = TestBed.inject(ToastService);
    svc.show('One');
    svc.show('Two');
    const ids = svc.toasts().map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
    expect(svc.toasts().map((t) => t.details)).toEqual(['One', 'Two']);
  });

  it('keeps errors on screen until dismissed, because a 2.2s error goes unread', async () => {
    const svc = TestBed.inject(ToastService);
    svc.error('Barcode not recognised');
    vi.advanceTimersByTime(60_000);
    expect(svc.toasts().length).toBe(1);
    expect(svc.toasts()[0].type).toBe('error');

    svc.dismiss(svc.toasts()[0].id);
    expect(svc.toasts().length).toBe(0);
  });

  it('still auto-dismisses an error given an explicit duration', () => {
    const svc = TestBed.inject(ToastService);
    svc.error('Retrying', 1000);
    vi.advanceTimersByTime(1000);
    expect(svc.toasts().length).toBe(0);
  });

  it('records primary, warning, and info types', () => {
    const svc = TestBed.inject(ToastService);
    svc.primary('Notice body');
    svc.warning('Due soon');
    svc.info('FYI');
    expect(svc.toasts().map((t) => t.type)).toEqual(['primary', 'warning', 'info']);
  });
});

@Component({
  imports: [UiToastHost],
  template: `<ui-toast-host />`,
})
class Host {}

describe('UiToastHost', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({
            AlertCircle,
            Check,
            Info,
            TriangleAlert,
            X,
          }),
        },
      ],
    }).compileComponents();
  });

  it('renders a white card with title, details, and icon', async () => {
    const fixture = TestBed.createComponent(Host);
    TestBed.inject(ToastService).success('This is a success message');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const card = el.querySelector('[role="status"]') as HTMLElement;

    expect(card.className).toContain('bg-surface');
    expect(card.className).toContain('toast-in');
    expect(card.textContent).toContain('Success');
    expect(card.textContent).toContain('This is a success message');
    expect(card.querySelector('.bg-success')).toBeTruthy();
  });

  it('renders an error as an assertive alert', async () => {
    const fixture = TestBed.createComponent(Host);
    TestBed.inject(ToastService).error('Sign-in failed. Check your email and password.');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const card = el.querySelector('[role="alert"]') as HTMLElement;

    expect(card.getAttribute('aria-live')).toBe('assertive');
    expect(card.textContent).toContain('Error');
    expect(card.textContent).toContain('Sign-in failed. Check your email and password.');
    expect(card.querySelector('.bg-danger')).toBeTruthy();
  });
});
