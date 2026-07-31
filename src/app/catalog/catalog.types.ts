import type { Enums, Tables, TablesUpdate } from '../core/supabase';

export type CopyStatus = Enums<'copy_status'>;
export type CopyRow = Tables<'copies'>;

type AssertTrue<T extends true> = T;

/** Fails the build if regenerated types drop `status` from copies updates. */
export type CopiesStatusIsGenerated = AssertTrue<
  'status' extends keyof TablesUpdate<'copies'> ? true : false
>;

/**
 * Client-safe copy update. `status` is excluded to match the column-level
 * GRANT — status changes go through `set_copy_status` only.
 */
export type CopiesClientUpdate = Omit<TablesUpdate<'copies'>, 'status'>;

export interface TitleCopySummary {
  id: string;
  barcode: string;
  status: CopyStatus;
}

export interface CatalogTitle {
  id: string;
  title: string;
  author: string;
  genre: string;
  isbn: string | null;
  description: string | null;
  replacement_cost: number | null;
  created_at: string;
  copies: TitleCopySummary[];
  availableCount: number;
  totalCount: number;
}

export interface CatalogListQuery {
  search: string;
  genre: string;
  page: number;
  pageSize: number;
}

export interface CatalogListResult {
  rows: CatalogTitle[];
  total: number;
}

export interface AddTitleInput {
  title: string;
  author: string;
  genre: string;
  isbn: string | null;
  description: string | null;
  replacement_cost: number | null;
  /** Barcodes must start with BK-. Empty → repository generates one. */
  barcodes: string[];
}

export interface EditCopyInput {
  copyId: string;
  barcode: string;
}

export type CatalogMutationError =
  | 'isbn_taken'
  | 'barcode_taken'
  | 'barcode_invalid'
  | 'copy_on_loan'
  | 'admin_required'
  | 'invalid_status_transition'
  | 'copy_not_found'
  | 'unexpected';

export type CatalogMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CatalogMutationError };
