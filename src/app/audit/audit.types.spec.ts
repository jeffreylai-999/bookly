import {
  AUDIT_ACTION_CODES,
  auditActionLabelKey,
  formatAuditDetail,
} from './audit.types';

describe('audit.types helpers', () => {
  it('maps machine action codes to nested Transloco keys', () => {
    expect(auditActionLabelKey('member.create')).toBe('audit.actionCodes.member.create');
    expect(auditActionLabelKey('loan.checkout')).toBe('audit.actionCodes.loan.checkout');
  });

  it('pretty-prints detail payloads for the inspect dialog', () => {
    expect(formatAuditDetail({ amount: 12, reason: 'waive' })).toBe(
      JSON.stringify({ amount: 12, reason: 'waive' }, null, 2),
    );
  });

  it('includes the action codes that exist in migrations today', () => {
    expect(AUDIT_ACTION_CODES).toContain('member.create');
    expect(AUDIT_ACTION_CODES).toContain('member.status');
    expect(AUDIT_ACTION_CODES).toContain('copy.set_status');
    expect(AUDIT_ACTION_CODES).toContain('title.create');
  });
});
