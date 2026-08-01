import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

import { CirculationRepository } from '../../circulation/circulation.repository';
import { ToastService } from '../../ui';

/** Max gap between wedge keystrokes (ms). Typing is slower. */
const WEDGE_MAX_GAP_MS = 50;
/** Minimum characters before Enter counts as a scan. */
const MIN_SCAN_LENGTH = 3;

@Service()
export class ScanService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly circulationRepo = inject(CirculationRepository);

  private buffer = '';
  private lastKeyAt = 0;
  private listening = false;
  private readonly onKeyDown = (event: KeyboardEvent) => void this.handleKeyDown(event);

  start(): void {
    if (!isPlatformBrowser(this.platformId) || this.listening) return;
    window.addEventListener('keydown', this.onKeyDown, true);
    this.listening = true;
  }

  stop(): void {
    if (!this.listening) return;
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.listening = false;
    this.resetBuffer();
  }

  private resetBuffer(): void {
    this.buffer = '';
    this.lastKeyAt = 0;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.isEditableTarget(event.target)) {
      this.resetBuffer();
      return;
    }

    const now = event.timeStamp;
    if (this.lastKeyAt > 0 && now - this.lastKeyAt > WEDGE_MAX_GAP_MS) {
      this.buffer = '';
    }
    this.lastKeyAt = now;

    if (event.key === 'Enter') {
      const code = this.buffer.trim();
      this.resetBuffer();
      if (code.length >= MIN_SCAN_LENGTH) {
        event.preventDefault();
        void this.routeBarcode(code);
      }
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.buffer += event.key;
    }
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return target.closest('[contenteditable="true"]') !== null;
  }

  async routeBarcode(raw: string): Promise<void> {
    const code = raw.trim();
    if (!code) return;

    if (code.startsWith('MBR-')) {
      await this.router.navigate(['/circulation'], { queryParams: { member: code } });
      return;
    }

    if (code.startsWith('BK-')) {
      await this.router.navigate(['/circulation'], { queryParams: { copy: code } });
      return;
    }

    const copy = await this.circulationRepo.findCopyByBarcode(code);
    if (copy.row) {
      await this.router.navigate(['/circulation'], {
        queryParams: { copy: copy.row.barcode },
      });
      return;
    }

    const member = await this.circulationRepo.findMemberByCard(code);
    if (member.row) {
      await this.router.navigate(['/circulation'], {
        queryParams: { member: member.row.card_barcode },
      });
      return;
    }

    this.toast.error(this.transloco.translate('scan.unknownBarcode'));
  }
}
