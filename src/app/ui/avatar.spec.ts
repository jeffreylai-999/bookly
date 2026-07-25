import { avatarColorIndex, avatarInitials } from './avatar';

describe('avatarInitials', () => {
  it('uses first + last name initials', () => {
    expect(avatarInitials('Maya Chen')).toBe('MC');
    expect(avatarInitials('Ana de la Cruz')).toBe('AC');
  });
  it('uses first two letters for single names', () => {
    expect(avatarInitials('Cher')).toBe('CH');
  });
  it('falls back for empty input', () => {
    expect(avatarInitials('  ')).toBe('?');
  });
});

describe('avatarColorIndex', () => {
  it('is deterministic and in range', () => {
    const a = avatarColorIndex('Maya Chen', 6);
    expect(avatarColorIndex('Maya Chen', 6)).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(6);
  });
});
