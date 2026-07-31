/** Generates a unique copy barcode with the required BK- prefix. */
export function generateCopyBarcode(): string {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  return `BK-${suffix}`;
}
