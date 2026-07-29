import { TestBed } from '@angular/core/testing';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

import { SUPABASE_CLIENT, provideSupabaseClient, type Database } from './index';

describe('provideSupabaseClient', () => {
  it('provides a typed browser client under browser platform', () => {
    TestBed.configureTestingModule({
      providers: [provideSupabaseClient(), { provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const client = TestBed.inject(SUPABASE_CLIENT);
    expect(client).toBeTruthy();
    expect(isPlatformBrowser(TestBed.inject(PLATFORM_ID))).toBe(true);

    // Compile-time smoke: Database exposes the generated public schema. This is
    // checked by tsc, not at runtime — asserting on the empty cast below would
    // compare {} to {} and pass regardless of what PublicTables resolves to.
    type PublicTables = Database['public']['Tables'];
    const _assert: PublicTables = {} as PublicTables;
    void _assert;
  });
});
