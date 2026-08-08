import { DestroyRef, effect, inject, type Signal } from '@angular/core';

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A single request against the resource this settlement was built for. */
export interface ResourceRequest {
  /** Distinct per request; also fit to use as a `resource()` params nonce. */
  readonly nonce: number;
  /** False once a newer request has begun. Only meaningful after `wait()` resolves. */
  isCurrent(): boolean;
  /** Resolves once this resource settles for this request, or once superseded. */
  wait(): Promise<void>;
}

/**
 * Bridges a `resource()`'s loading state back onto Promise-returning
 * imperative call sites without depending on `ApplicationRef.whenStable()`,
 * whose stability tracks every pending task in the whole app rather than
 * this resource's own load — an unrelated long-lived task anywhere else
 * (including one started around another component's `ngOnInit`) delays
 * every caller here, and can hang indefinitely.
 *
 * Call `begin()` synchronously, right before publishing fresh params. It
 * resolves the previous request's waiter immediately, so a superseded
 * caller's `await` returns without ever inspecting settled state — a
 * `resource()` re-request can supersede the in-flight one without its
 * `isLoading()` ever toggling back to `false` in between, so only this
 * proactive resolution (not the settlement effect below) can unblock it.
 * The returned token's `wait()` settles only once this resource actually
 * leaves the loading state for the request current when it was created,
 * which is after its `value()`/`error()` have committed.
 */
export class ResourceSettlement {
  private nonce = 0;
  private pending: Deferred | null = null;

  constructor(isLoading: Signal<boolean>) {
    const ref = effect(() => {
      if (isLoading()) return;
      this.settle();
    });
    inject(DestroyRef).onDestroy(() => {
      ref.destroy();
      // The effect above can no longer resolve a request left pending at
      // destruction time, and a component-scoped store torn down mid-load
      // must not leave that caller's `await` pending forever or let it act
      // as if it were still current once something eventually resolves it.
      this.invalidate();
    });
  }

  begin(): ResourceRequest {
    this.settle();
    const nonce = ++this.nonce;
    const deferred = createDeferred();
    this.pending = deferred;
    return {
      nonce,
      isCurrent: () => this.nonce === nonce,
      wait: () => deferred.promise,
    };
  }

  /**
   * Resolves the active request's waiter and invalidates its `isCurrent()`,
   * without starting a replacement request. For a caller that intentionally
   * issues no new request in its place — e.g. a query that turned out to be
   * invalid — rather than superseding the in-flight load with another one.
   */
  invalidate(): void {
    this.settle();
    this.nonce++;
  }

  private settle(): void {
    this.pending?.resolve();
    this.pending = null;
  }
}
