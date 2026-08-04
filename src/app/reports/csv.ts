/** Row cells are pre-formatted strings/numbers — same values shown on screen. */
export type CsvRow = (string | number)[];

/**
 * RFC 4180-ish CSV: quotes a field only when it contains a comma, quote, or
 * newline, doubling embedded quotes. CRLF line endings for widest spreadsheet
 * compatibility (Excel on Windows treats bare `\n` inconsistently).
 */
export function toCsv(headers: string[], rows: CsvRow[]): string {
  const escape = (cell: string | number): string => {
    const text = String(cell);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers, ...rows].map((row) => row.map(escape).join(','));
  return lines.join('\r\n');
}

/**
 * Triggers a browser file download. Pure DOM APIs, called only from a click
 * handler — never during SSR (the ADR-driven client-only rendering rule is
 * about ECharts specifically, but this has the same "never on the server"
 * shape, so the caller guards it the same way).
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
