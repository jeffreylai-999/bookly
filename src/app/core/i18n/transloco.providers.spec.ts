import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { TranslocoService } from '@jsverse/transloco';
import { vi } from 'vitest';

import { provideAppTransloco } from './transloco.providers';

describe('provideAppTransloco', () => {
  it('has English ready before HTTP, so the first translate does not log a miss', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideAppTransloco()],
    });

    const transloco = TestBed.inject(TranslocoService);
    expect(transloco.translate('nav.members')).toBe('Members');
    expect(transloco.translate('members.status.all')).toBe('All statuses');
    expect(transloco.translate('notifications.bellLabel')).toBe('Notifications');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
