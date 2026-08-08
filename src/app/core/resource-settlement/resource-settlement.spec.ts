import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ResourceSettlement } from './resource-settlement';

describe('ResourceSettlement', () => {
  it('resolves the current request only after loading settles', async () => {
    const loading = signal(false);
    const settlement = TestBed.runInInjectionContext(() => new ResourceSettlement(loading));

    const request = settlement.begin();
    loading.set(true);
    TestBed.flushEffects();

    let settled = false;
    void request.wait().then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    loading.set(false);
    TestBed.flushEffects();
    await request.wait();

    expect(settled).toBe(true);
    expect(request.isCurrent()).toBe(true);
  });

  it('resolves a superseded request immediately, without waiting for loading to settle', async () => {
    const loading = signal(false);
    const settlement = TestBed.runInInjectionContext(() => new ResourceSettlement(loading));

    const stale = settlement.begin();
    loading.set(true);
    TestBed.flushEffects();

    // A new request supersedes `stale` while the resource is still loading —
    // `loading()` never toggles back to `false` for it, so only proactive
    // resolution on `begin()` (not the settlement effect) can unblock it.
    const current = settlement.begin();

    await stale.wait();

    expect(stale.isCurrent()).toBe(false);
    expect(current.isCurrent()).toBe(true);
  });

  it('resolves the active request and invalidates it when the owning injector is destroyed', async () => {
    const loading = signal(false);

    @Component({ template: '' })
    class Host {
      readonly settlement = new ResourceSettlement(loading);
    }

    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    const request = fixture.componentInstance.settlement.begin();
    loading.set(true);
    fixture.detectChanges();
    expect(request.isCurrent()).toBe(true);

    // A component-scoped store destroyed mid-load must not leave its
    // in-flight caller's `wait()` pending forever, nor let it act as if it
    // were still the active request once it does resolve.
    fixture.destroy();

    await request.wait();
    expect(request.isCurrent()).toBe(false);
  });

  it('resolving and invalidating a request on destroy does not throw when nothing is pending', () => {
    const loading = signal(false);

    @Component({ template: '' })
    class Host {
      readonly settlement = new ResourceSettlement(loading);
    }

    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);

    expect(() => fixture.destroy()).not.toThrow();
  });

  it('invalidate() resolves the active request and invalidates it without starting a new one', async () => {
    const loading = signal(false);
    const settlement = TestBed.runInInjectionContext(() => new ResourceSettlement(loading));

    const request = settlement.begin();
    loading.set(true);
    TestBed.flushEffects();

    settlement.invalidate();

    await request.wait();
    expect(request.isCurrent()).toBe(false);

    // No new request was started — a subsequent `begin()` must still hand
    // out a fresh, current token rather than reusing a stale one.
    const next = settlement.begin();
    expect(next.isCurrent()).toBe(true);
  });
});
