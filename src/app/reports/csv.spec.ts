import { downloadCsv, toCsv } from './csv';

describe('toCsv', () => {
  it('joins headers and rows with CRLF line endings', () => {
    const csv = toCsv(
      ['Title', 'Checkouts'],
      [
        ['Dune', 3],
        ['Beta', 1],
      ],
    );
    expect(csv).toBe('Title,Checkouts\r\nDune,3\r\nBeta,1');
  });

  it('quotes fields containing a comma, quote, or newline, doubling embedded quotes', () => {
    const csv = toCsv(['Title'], [['Smith, "The Title"'], ['Line1\nLine2']]);
    expect(csv).toBe('Title\r\n"Smith, ""The Title"""\r\n"Line1\nLine2"');
  });

  it('leaves plain fields unquoted', () => {
    const csv = toCsv(['Genre', 'Count'], [['Sci-fi', 2]]);
    expect(csv).toBe('Genre,Count\r\nSci-fi,2');
  });

  it('renders an empty rows list as just the header line', () => {
    expect(toCsv(['A', 'B'], [])).toBe('A,B');
  });
});

describe('downloadCsv', () => {
  it('creates an object URL, clicks a download anchor, and revokes the URL', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi.fn();
    const anchor = document.createElement('a');
    vi.spyOn(anchor, 'click').mockImplementation(clickSpy);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => (tag === 'a' ? anchor : document.createElement(tag)));

    downloadCsv('report.csv', 'a,b\r\n1,2');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toBe('report.csv');
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    createElementSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
