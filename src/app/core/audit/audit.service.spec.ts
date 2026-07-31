import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../supabase';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('calls log_audit without an actor param (server derives it)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'audit-id', error: null });

    await TestBed.configureTestingModule({
      providers: [
        AuditService,
        { provide: SUPABASE_CLIENT, useValue: { rpc } },
      ],
    }).compileComponents();

    const service = TestBed.inject(AuditService);
    const result = await service.log({
      action: 'member.update',
      entityType: 'member',
      entityId: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
      detail: { name: 'Ada' },
    });

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('log_audit', {
      p_action: 'member.update',
      p_entity_type: 'member',
      p_entity_id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeee0001',
      p_detail: { name: 'Ada' },
    });
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args).not.toHaveProperty('p_actor');
    expect(args).not.toHaveProperty('actor');
  });
});
