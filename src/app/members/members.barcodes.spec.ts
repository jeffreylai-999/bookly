import { MEMBER_CARD_PATTERN, MEMBER_CARD_PREFIX } from './members.types';
import {
  generateMemberBarcode,
  generateMemberBarcodeSuffix,
  stripMemberCardPrefix,
  withMemberCardPrefix,
} from './members.barcodes';

describe('member barcodes', () => {
  it('returns a unique MBR- scan id', () => {
    const a = generateMemberBarcode();
    const b = generateMemberBarcode();
    expect(a.startsWith(MEMBER_CARD_PREFIX)).toBe(true);
    expect(a).toMatch(MEMBER_CARD_PATTERN);
    expect(a).not.toBe(b);
  });

  it('strips and restores the locked prefix', () => {
    expect(stripMemberCardPrefix('MBR-ADA-1')).toBe('ADA-1');
    expect(stripMemberCardPrefix('ADA-1')).toBe('ADA-1');
    expect(withMemberCardPrefix('ADA-1')).toBe('MBR-ADA-1');
    expect(withMemberCardPrefix('MBR-ADA-1')).toBe('MBR-ADA-1');
    expect(generateMemberBarcodeSuffix()).toMatch(/^[A-F0-9]{10}$/);
  });
});
