import type { MembersClientInsert, MembersClientUpdate } from './members.types';

describe('MembersClientUpdate / MembersClientInsert', () => {
  it('allows the columns staff may write', () => {
    const insert: MembersClientInsert = {
      name: 'Ada Lovelace',
      member_type_id: 't1',
      card_barcode: 'MBR-1001',
    };
    const patch: MembersClientUpdate = { phone: '555-0100' };

    expect(insert.card_barcode).toBe('MBR-1001');
    expect(patch.phone).toBe('555-0100');
  });

  it('rejects status — the column GRANT keeps it RPC-only', () => {
    const insert = {
      name: 'Ada Lovelace',
      member_type_id: 't1',
      card_barcode: 'MBR-1001',
      // @ts-expect-error status must never be client-writable. If this directive
      // ever reports as unused, the exclusion has been lost — fix the type,
      // don't delete the directive.
      status: 'blocked',
    } satisfies MembersClientInsert;

    const patch = {
      name: 'Ada Lovelace',
      // @ts-expect-error status must never be client-updatable.
      status: 'suspended',
    } satisfies MembersClientUpdate;

    expect(insert.name).toBe('Ada Lovelace');
    expect(patch.name).toBe('Ada Lovelace');
  });
});
