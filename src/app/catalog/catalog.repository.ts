import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../core/supabase';
import type {
  AddTitleInput,
  CatalogListQuery,
  CatalogListResult,
  CatalogMutationError,
  CatalogMutationResult,
  CatalogTitle,
  CopiesClientUpdate,
  CopyRow,
  CopyStatus,
  EditCopyInput,
  TitleCopySummary,
} from './catalog.types';
import { generateCopyBarcode } from './catalog.barcodes';

function mapCopy(row: { id: string; barcode: string; status: CopyStatus }): TitleCopySummary {
  return { id: row.id, barcode: row.barcode, status: row.status };
}

function toCatalogTitle(row: {
  id: string;
  title: string;
  author: string;
  genre: string;
  isbn: string | null;
  description: string | null;
  replacement_cost: number | null;
  created_at: string;
  copies: { id: string; barcode: string; status: CopyStatus }[] | null;
}): CatalogTitle {
  const copies = (row.copies ?? []).map(mapCopy);
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    genre: row.genre,
    isbn: row.isbn,
    description: row.description,
    replacement_cost: row.replacement_cost,
    created_at: row.created_at,
    copies,
    availableCount: copies.filter((c) => c.status === 'available').length,
    totalCount: copies.length,
  };
}

function mapRpcError(message: string | undefined): CatalogMutationError {
  if (!message) return 'unexpected';
  if (message.includes('copy_on_loan')) return 'copy_on_loan';
  if (message.includes('admin_required')) return 'admin_required';
  if (message.includes('invalid_status_transition')) return 'invalid_status_transition';
  if (message.includes('copy_not_found')) return 'copy_not_found';
  if (message.includes('barcode_invalid')) return 'barcode_invalid';
  if (message.includes('duplicate key') && message.includes('isbn')) return 'isbn_taken';
  if (message.includes('duplicate key') && message.includes('barcode')) return 'barcode_taken';
  if (message.includes('titles_isbn_unique')) return 'isbn_taken';
  if (message.includes('copies_barcode_unique')) return 'barcode_taken';
  return 'unexpected';
}

function mapWriteError(code: string | undefined, message: string | undefined): CatalogMutationError {
  if (code === '23505') {
    if (message?.toLowerCase().includes('barcode')) return 'barcode_taken';
    return 'isbn_taken';
  }
  if (code === '23514' || message?.includes('copies_barcode_bk_prefix')) return 'barcode_invalid';
  return 'unexpected';
}

@Service()
export class CatalogRepository {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async listTitles(query: CatalogListQuery): Promise<CatalogListResult> {
    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let builder = this.supabase
      .from('titles')
      .select('*, copies(id, barcode, status)', { count: 'exact' })
      .order('title', { ascending: true })
      .range(from, to);

    const search = query.search.trim();
    if (search) {
      // Quote the pattern so commas / wildcards in the query cannot break `.or()`.
      const pattern = `"%${search.replace(/"/g, '')}%"`;
      builder = builder.or(`title.ilike.${pattern},author.ilike.${pattern}`);
    }
    if (query.genre.trim()) {
      builder = builder.eq('genre', query.genre.trim());
    }

    const { data, error, count } = await builder;
    if (error) {
      throw new Error(error.message);
    }

    return {
      rows: (data ?? []).map(toCatalogTitle),
      total: count ?? 0,
    };
  }

  async listGenres(): Promise<string[]> {
    const { data, error } = await this.supabase.from('titles').select('genre').order('genre');
    if (error) {
      throw new Error(error.message);
    }
    const seen = new Set<string>();
    for (const row of data ?? []) {
      seen.add(row.genre);
    }
    return [...seen];
  }

  async addTitle(input: AddTitleInput): Promise<CatalogMutationResult<CatalogTitle>> {
    const barcodes =
      input.barcodes.length > 0
        ? input.barcodes.map((b) => b.trim()).filter(Boolean)
        : [generateCopyBarcode()];

    for (const barcode of barcodes) {
      if (!barcode.startsWith('BK-')) {
        return { ok: false, error: 'barcode_invalid' };
      }
    }

    // Generator types optional SQL args as required `string`/`number`; empty
    // strings and null costs are valid at runtime (nullif / null insert).
    const { data, error } = await this.supabase.rpc('add_title_with_copies', {
      p_title: input.title.trim(),
      p_author: input.author.trim(),
      p_genre: input.genre.trim(),
      p_isbn: input.isbn?.trim() ?? '',
      p_description: input.description?.trim() ?? '',
      p_replacement_cost: input.replacement_cost as number,
      p_barcodes: barcodes,
    });

    if (error || !data) {
      return { ok: false, error: mapRpcError(error?.message) };
    }

    const payload = data as {
      id: string;
      title: string;
      author: string;
      genre: string;
      isbn: string | null;
      description: string | null;
      replacement_cost: number | null;
      created_at: string;
      copies: { id: string; barcode: string; status: CopyStatus }[];
    };

    return { ok: true, value: toCatalogTitle(payload) };
  }

  async editCopy(input: EditCopyInput): Promise<CatalogMutationResult<CopyRow>> {
    const barcode = input.barcode.trim();
    if (!barcode.startsWith('BK-')) {
      return { ok: false, error: 'barcode_invalid' };
    }

    const patch: CopiesClientUpdate = { barcode };
    const { data, error } = await this.supabase
      .from('copies')
      .update(patch)
      .eq('id', input.copyId)
      .select('*')
      .single();

    if (error || !data) {
      return { ok: false, error: mapWriteError(error?.code, error?.message) };
    }
    return { ok: true, value: data };
  }

  async setCopyStatus(
    copyId: string,
    status: CopyStatus,
  ): Promise<CatalogMutationResult<CopyRow>> {
    const { data, error } = await this.supabase.rpc('set_copy_status', {
      p_copy_id: copyId,
      p_status: status,
    });

    if (error || !data) {
      return { ok: false, error: mapRpcError(error?.message) };
    }
    return { ok: true, value: data };
  }
}
