import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToastService } from './toast';

describe('ToastService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
  });
  afterEach(() => vi.useRealTimers());

  it('shows and auto-dismisses after 2200ms', () => {
    const svc = TestBed.inject(ToastService);
    svc.show('Checked in');
    expect(svc.toasts().map((t) => t.message)).toEqual(['Checked in']);
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
    expect(svc.toasts().map((t) => t.message)).toEqual(['One', 'Two']);
  });

  it('keeps errors on screen until dismissed, because a 2.2s error goes unread', () => {
    const svc = TestBed.inject(ToastService);
    svc.error('Barcode not recognised');
    vi.advanceTimersByTime(60_000);
    expect(svc.toasts().length).toBe(1);
    expect(svc.toasts()[0].tone).toBe('danger');

    svc.dismiss(svc.toasts()[0].id);
    expect(svc.toasts().length).toBe(0);
  });

  it('still auto-dismisses an error given an explicit duration', () => {
    const svc = TestBed.inject(ToastService);
    svc.error('Retrying', 1000);
    vi.advanceTimersByTime(1000);
    expect(svc.toasts().length).toBe(0);
  });
});
