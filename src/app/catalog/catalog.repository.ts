import { Service, inject } from '@angular/core';

import {
  createPostgrestAccess,
  mapPostgresCode,
  mapRpcError,
  pageToRange,
  toAccessResult,
} from '../core/postgrest';
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

const CATALOG_RPC_ERROR_CODES = [
  'copy_on_loan',
  'admin_required',
  'invalid_status_transition',
  'copy_not_found',
  'barcode_invalid',
  'isbn_taken',
  'barcode_taken',
] as const satisfies readonly Exclude<CatalogMutationError, 'unexpected'>[];

function mapCatalogRpcError(message: string | undefined): CatalogMutationError {
  if (!message) return 'unexpected';
  if (message.includes('duplicate key') && message.includes('isbn')) return 'isbn_taken';
  if (message.includes('duplicate key') && message.includes('barcode')) return 'barcode_taken';
  if (message.includes('titles_isbn_unique')) return 'isbn_taken';
  if (message.includes('copies_barcode_unique')) return 'barcode_taken';
  return mapRpcError(message, CATALOG_RPC_ERROR_CODES);
}

function mapCatalogWriteError(
  code: string | null | undefined,
  message: string | undefined,
): CatalogMutationError {
  if (code === '23505') {
    if (message?.toLowerCase().includes('barcode')) return 'barcode_taken';
    return 'isbn_taken';
  }
  if (message?.includes('copies_barcode_bk_prefix')) return 'barcode_invalid';
  return mapPostgresCode(code, { '23514': 'barcode_invalid' }, 'unexpected');
}

@Service()
export class CatalogRepository {
  private readonly access = createPostgrestAccess(inject(SUPABASE_CLIENT));

  async listTitles(query: CatalogListQuery): Promise<CatalogListResult> {
    const { from, to } = pageToRange(query.page, query.pageSize);

    let builder = this.access
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

    const result = toAccessResult(await builder);
    if (!result.ok) {
      return { rows: [], total: 0, error: result.error.message };
    }

    return {
      rows: (result.data ?? []).map(toCatalogTitle),
      total: result.count ?? 0,
      error: null,
    };
  }

  async listGenres(): Promise<{ rows: string[]; error: string | null }> {
    const result = toAccessResult(
      await this.access.from('titles').select('genre').order('genre'),
    );
    if (!result.ok) {
      return { rows: [], error: result.error.message };
    }
    const seen = new Set<string>();
    for (const row of result.data ?? []) {
      seen.add(row.genre);
    }
    return { rows: [...seen], error: null };
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
    const result = await this.access.rpc('add_title_with_copies', {
      p_title: input.title.trim(),
      p_author: input.author.trim(),
      p_genre: input.genre.trim(),
      p_isbn: input.isbn?.trim() ?? '',
      p_description: input.description?.trim() ?? '',
      p_replacement_cost: input.replacement_cost as number,
      p_barcodes: barcodes,
    });

    if (!result.ok) {
      return { ok: false, error: mapCatalogRpcError(result.error.message) };
    }
    if (!result.data) {
      return { ok: false, error: 'unexpected' };
    }

    const payload = result.data as {
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
    const result = toAccessResult(
      await this.access
        .from('copies')
        .update(patch)
        .eq('id', input.copyId)
        .select('*')
        .single(),
    );

    if (!result.ok) {
      return {
        ok: false,
        error: mapCatalogWriteError(result.error.code, result.error.message),
      };
    }
    if (!result.data) {
      return { ok: false, error: 'unexpected' };
    }
    return { ok: true, value: result.data };
  }

  async setCopyStatus(
    copyId: string,
    status: CopyStatus,
  ): Promise<CatalogMutationResult<CopyRow>> {
    const result = await this.access.rpc('set_copy_status', {
      p_copy_id: copyId,
      p_status: status,
    });

    if (!result.ok) {
      return { ok: false, error: mapCatalogRpcError(result.error.message) };
    }
    if (!result.data) {
      return { ok: false, error: 'unexpected' };
    }
    return { ok: true, value: result.data };
  }
}
