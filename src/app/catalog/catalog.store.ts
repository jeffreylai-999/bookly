import { Service, computed, inject, linkedSignal, resource, signal } from '@angular/core';

import { ResourceSettlement } from '../core/resource-settlement';
import { clampPage, isListEmpty } from '../ui';
import { CatalogRepository } from './catalog.repository';
import type {
  AddTitleInput,
  CatalogMutationError,
  CatalogTitle,
  CopyStatus,
  EditCopyInput,
} from './catalog.types';

const DEFAULT_PAGE_SIZE = 10;
const EMPTY_LIST: CatalogListValue = { rows: [], total: 0, genres: [] };

type CatalogListValue = { rows: CatalogTitle[]; total: number; genres: string[] };
type CatalogListParams = {
  search: string;
  genre: string;
  page: number;
  pageSize: number;
  nonce: number;
};

@Service()
export class CatalogStore {
  private readonly repo = inject(CatalogRepository);

  private readonly searchState = signal('');
  private readonly genreState = signal('');
  private readonly pageState = signal(1);
  private readonly pageSizeState = signal(DEFAULT_PAGE_SIZE);
  private readonly query = signal<CatalogListParams | undefined>(undefined);

  private readonly listResource = resource({
    params: () => this.query(),
    loader: async ({ params }) => {
      const [list, genres] = await Promise.all([
        this.repo.listTitles({
          search: params.search,
          genre: params.genre,
          page: params.page,
          pageSize: params.pageSize,
        }),
        this.repo.listGenres(),
      ]);
      return { rows: list.rows, total: list.total, genres };
    },
  });

  private readonly list = linkedSignal<CatalogListValue | null | undefined, CatalogListValue>({
    source: () => (this.listResource.error() ? null : this.listResource.value()),
    computation: (next, previous) =>
      next === null
        ? { ...EMPTY_LIST, genres: previous?.value.genres ?? [] }
        : (next ?? previous?.value ?? EMPTY_LIST),
  });

  private readonly settlement = new ResourceSettlement(this.listResource.isLoading);

  readonly rows = computed(() => this.list().rows);
  readonly total = computed(() => this.list().total);
  readonly genres = computed(() => this.list().genres);
  readonly search = this.searchState.asReadonly();
  readonly genre = this.genreState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = this.pageSizeState.asReadonly();
  readonly loading = this.listResource.isLoading;
  readonly error = computed(() => (this.listResource.error() ? 'load_failed' : null));

  readonly hasActiveFilters = computed(
    () => this.searchState().trim().length > 0 || this.genreState().trim().length > 0,
  );

  /** True only for a successful empty result — not while loading or after a load error. */
  readonly isEmpty = computed(() => isListEmpty(this.loading(), this.error(), this.total()));

  async load(): Promise<void> {
    await this.runQuery();
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

  async addTitle(
    input: AddTitleInput,
  ): Promise<{ ok: true } | { ok: false; error: CatalogMutationError }> {
    return this.mutateAndReload(() => this.repo.addTitle(input));
  }

  async editCopy(
    input: EditCopyInput,
  ): Promise<{ ok: true } | { ok: false; error: CatalogMutationError }> {
    return this.mutateAndReload(() => this.repo.editCopy(input));
  }

  async setCopyStatus(
    copyId: string,
    status: CopyStatus,
  ): Promise<{ ok: true } | { ok: false; error: CatalogMutationError }> {
    return this.mutateAndReload(() => this.repo.setCopyStatus(copyId, status));
  }

  private async mutateAndReload(
    run: () => Promise<{ ok: true; value: unknown } | { ok: false; error: CatalogMutationError }>,
  ): Promise<{ ok: true } | { ok: false; error: CatalogMutationError }> {
    const result = await run();
    if (!result.ok) {
      return result;
    }
    await this.load();
    return { ok: true };
  }

  private async runQuery(): Promise<void> {
    const request = this.settlement.begin();
    this.query.set({
      search: this.searchState(),
      genre: this.genreState(),
      page: this.pageState(),
      pageSize: this.pageSizeState(),
      nonce: request.nonce,
    });
    await request.wait();
    if (!request.isCurrent()) return;

    if (this.error() != null) {
      return;
    }
    const page = clampPage(this.pageState(), this.total(), this.pageSizeState());
    if (page !== this.pageState()) {
      this.pageState.set(page);
      await this.runQuery();
    }
  }
}
