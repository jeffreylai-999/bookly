import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

import { CirculationRepository } from '../../circulation/circulation.repository';
import { ToastService } from '../../ui';
import { ScanService } from './scan.service';

describe('ScanService', () => {
  function setup(opts?: {
    findCopy?: ReturnType<typeof vi.fn>;
    findMember?: ReturnType<typeof vi.fn>;
  }) {
    const toastError = vi.fn();
    const findCopyByBarcode =
      opts?.findCopy ?? vi.fn().mockResolvedValue({ row: null, error: null });
    const findMemberByCard =
      opts?.findMember ?? vi.fn().mockResolvedValue({ row: null, error: null });

    TestBed.configureTestingModule({
      providers: [
        ScanService,
        provideRouter([]),
        { provide: ToastService, useValue: { error: toastError, show: vi.fn() } },
        {
          provide: TranslocoService,
          useValue: { translate: (key: string) => key },
        },
        {
          provide: CirculationRepository,
          useValue: { findCopyByBarcode, findMemberByCard },
        },
      ],
    });

    return {
      service: TestBed.inject(ScanService),
      router: TestBed.inject(Router),
      toastError,
      findCopyByBarcode,
      findMemberByCard,
    };
  }

  function key(target: EventTarget | null, key: string, timeStamp: number) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    Object.defineProperty(event, 'target', { value: target });
    window.dispatchEvent(event);
  }

  it('routes MBR- scans to circulation with member query', async () => {
    const { service, router } = setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    service.start();

    const body = document.body;
    let t = 1000;
    for (const ch of 'MBR-1001') {
      key(body, ch, t);
      t += 20;
    }
    key(body, 'Enter', t);

    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(['/circulation'], {
        queryParams: { member: 'MBR-1001' },
      });
    });

    service.stop();
  });

  it('routes BK- scans to circulation with copy query', async () => {
    const { service, router } = setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    service.start();

    const body = document.body;
    let t = 2000;
    for (const ch of 'BK-DUNE-001') {
      key(body, ch, t);
      t += 15;
    }
    key(body, 'Enter', t);

    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(['/circulation'], {
        queryParams: { copy: 'BK-DUNE-001' },
      });
    });

    service.stop();
  });

  it('ignores keystrokes while focus is in an input', async () => {
    const { service, router } = setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    service.start();

    const input = document.createElement('input');
    document.body.appendChild(input);
    let t = 3000;
    for (const ch of 'MBR-1001') {
      key(input, ch, t);
      t += 15;
    }
    key(input, 'Enter', t);

    await new Promise((r) => setTimeout(r, 30));
    expect(navigate).not.toHaveBeenCalled();

    input.remove();
    service.stop();
  });

  it('toasts when an unknown barcode cannot be resolved', async () => {
    const { service, toastError } = setup({
      findCopy: vi.fn().mockResolvedValue({ row: null, error: null }),
      findMember: vi.fn().mockResolvedValue({ row: null, error: null }),
    });
    service.start();

    const body = document.body;
    let t = 4000;
    for (const ch of 'XYZ-999') {
      key(body, ch, t);
      t += 15;
    }
    key(body, 'Enter', t);

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('scan.unknownBarcode');
    });

    service.stop();
  });
});
