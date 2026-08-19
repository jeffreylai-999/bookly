import {
  AUDIT_ACTION_CODES,
  auditActionLabelKey,
  formatAuditDetail,
  highlightJson,
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

  it('colors keys, strings, numbers, booleans, and null in detail JSON', () => {
    const tokens = highlightJson({
      name: 'Ada',
      amount: 12,
      waived: true,
      note: null,
    });
    const byKind = Object.fromEntries(
      tokens.filter((t) => t.kind !== 'plain' && t.kind !== 'punctuation').map((t) => [t.text, t.kind]),
    );
    expect(byKind['"name"']).toBe('key');
    expect(byKind['"Ada"']).toBe('string');
    expect(byKind['"amount"']).toBe('key');
    expect(byKind['12']).toBe('number');
    expect(byKind['"waived"']).toBe('key');
    expect(byKind['true']).toBe('boolean');
    expect(byKind['"note"']).toBe('key');
    expect(byKind['null']).toBe('null');
    expect(tokens.map((t) => t.text).join('')).toBe(
      JSON.stringify({ name: 'Ada', amount: 12, waived: true, note: null }, null, 2),
    );
  });

  it('keeps escaped quotes inside a string token', () => {
    const tokens = highlightJson({ quote: 'say "hi"' });
    expect(tokens.some((t) => t.kind === 'string' && t.text === '"say \\"hi\\""')).toBe(true);
  });

  it('includes the action codes that exist in migrations today', () => {
    expect(AUDIT_ACTION_CODES).toContain('member.create');
    expect(AUDIT_ACTION_CODES).toContain('member.status');
    expect(AUDIT_ACTION_CODES).toContain('copy.set_status');
    expect(AUDIT_ACTION_CODES).toContain('title.create');
  });
});
