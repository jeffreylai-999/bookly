import { Service, computed, inject, signal } from '@angular/core';

import { CatalogRepository } from './catalog.repository';
import type {
  AddTitleInput,
  CatalogMutationError,
  CatalogTitle,
  CopyStatus,
  EditCopyInput,
} from './catalog.types';

const DEFAULT_PAGE_SIZE = 10;

@Service()
export class CatalogStore {
  private readonly repo = inject(CatalogRepository);

  private readonly rowsState = signal<CatalogTitle[]>([]);
  private readonly totalState = signal(0);
  private readonly genresState = signal<string[]>([]);
  private readonly searchState = signal('');
  private readonly genreState = signal('');
  private readonly pageState = signal(1);
  private readonly pageSizeState = signal(DEFAULT_PAGE_SIZE);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly rows = this.rowsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly genres = this.genresState.asReadonly();
  readonly search = this.searchState.asReadonly();
  readonly genre = this.genreState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = this.pageSizeState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly hasActiveFilters = computed(
    () => this.searchState().trim().length > 0 || this.genreState().trim().length > 0,
  );

  readonly isEmpty = computed(() => !this.loadingState() && this.totalState() === 0);

  async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const [list, genres] = await Promise.all([
        this.repo.listTitles({
          search: this.searchState(),
          genre: this.genreState(),
          page: this.pageState(),
          pageSize: this.pageSizeState(),
        }),
        this.repo.listGenres(),
      ]);
      this.rowsState.set(list.rows);
      this.totalState.set(list.total);
      this.genresState.set(genres);
    } catch {
      this.errorState.set('load_failed');
      this.rowsState.set([]);
      this.totalState.set(0);
    } finally {
      this.loadingState.set(false);
    }
  }

  setSearch(value: string): void {
    this.searchState.set(value);
    this.pageState.set(1);
  }

  setGenre(value: string): void {
    this.genreState.set(value);
    this.pageState.set(1);
  }

  setPage(page: number): void {
    this.pageState.set(Math.max(1, page));
  }

  async applySearch(value: string): Promise<void> {
    this.setSearch(value);
    await this.load();
  }

  async applyGenre(value: string): Promise<void> {
    this.setGenre(value);
    await this.load();
  }

  async applyPage(page: number): Promise<void> {
    this.setPage(page);
    await this.load();
  }

  async clearFilters(): Promise<void> {
    this.searchState.set('');
    this.genreState.set('');
    this.pageState.set(1);
    await this.load();
  }

  async addTitle(input: AddTitleInput): Promise<{ ok: true } | { ok: false; error: CatalogMutationError }> {
    const result = await this.repo.addTitle(input);
    if (!result.ok) {
      return result;
    }
    await this.load();
    return { ok: true };
  }

  async editCopy(
    input: EditCopyInput,
  ): Promise<{ ok: true } | { ok: false; error: CatalogMutationError }> {
    const result = await this.repo.editCopy(input);
    if (!result.ok) {
      return result;
    }
    await this.load();
    return { ok: true };
  }

  async setCopyStatus(
    copyId: string,
    status: CopyStatus,
  ): Promise<{ ok: true } | { ok: false; error: CatalogMutationError }> {
    const result = await this.repo.setCopyStatus(copyId, status);
    if (!result.ok) {
      return result;
    }
    await this.load();
    return { ok: true };
  }
}
