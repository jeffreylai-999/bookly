import { MEMBER_CARD_PREFIX } from './members.types';

/** Unique member card barcode with the required MBR- prefix. */
export function generateMemberBarcode(): string {
  return withMemberCardPrefix(generateMemberBarcodeSuffix());
}

/** Random suffix shown next to the locked MBR- prefix in the add-member form. */
export function generateMemberBarcodeSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
}

export function stripMemberCardPrefix(barcode: string): string {
  return barcode.startsWith(MEMBER_CARD_PREFIX)
    ? barcode.slice(MEMBER_CARD_PREFIX.length)
    : barcode;
}

export function withMemberCardPrefix(suffix: string): string {
  const trimmed = suffix.trim();
  if (trimmed.startsWith(MEMBER_CARD_PREFIX)) return trimmed;
  return `${MEMBER_CARD_PREFIX}${trimmed}`;
}
