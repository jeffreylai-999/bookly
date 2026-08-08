import { Service, inject } from '@angular/core';

import { listMemberTypes } from '../core/member-types';
import {
  createPostgrestAccess,
  mapPostgresCode,
  toAccessResult,
} from '../core/postgrest';
import {
  SUPABASE_CLIENT,
  type AppSettingsClientUpdate,
  type MemberTypesClientInsert,
  type MemberTypesClientUpdate,
} from '../core/supabase';
import type { AppSettings, MemberType, SettingsMutationError } from './settings.types';

const WRITE_ERROR_CODES = {
  '23505': 'name_taken',
  '23503': 'member_type_in_use',
} as const satisfies Record<string, SettingsMutationError>;

function typedWriteError(code: string | null): SettingsMutationError {
  return mapPostgresCode(code, WRITE_ERROR_CODES, 'save_failed');
}

@Service()
export class SettingsRepository {
  private readonly access = createPostgrestAccess(inject(SUPABASE_CLIENT));

  async listMemberTypes(): Promise<{ rows: MemberType[]; error: string | null }> {
    return listMemberTypes(this.access);
  }

  async getAppSettings(): Promise<{ row: AppSettings | null; error: string | null }> {
    const result = toAccessResult(
      await this.access.from('app_settings').select('*').eq('id', true).single(),
    );
    if (!result.ok) {
      return { row: null, error: result.error.message };
    }
    return { row: result.data ?? null, error: null };
  }

  async createMemberType(
    input: MemberTypesClientInsert,
  ): Promise<{ row: MemberType | null; error: SettingsMutationError | null }> {
    const result = toAccessResult(
      await this.access.from('member_types').insert(input).select().single(),
    );
    if (!result.ok) {
      return { row: null, error: typedWriteError(result.error.code) };
    }
    if (!result.data) {
      return { row: null, error: 'save_failed' };
    }
    return { row: result.data, error: null };
  }

  async updateMemberType(
    id: string,
    patch: MemberTypesClientUpdate,
  ): Promise<{ row: MemberType | null; error: SettingsMutationError | null }> {
    const result = toAccessResult(
      await this.access.from('member_types').update(patch).eq('id', id).select().single(),
    );
    if (!result.ok) {
      return { row: null, error: typedWriteError(result.error.code) };
    }
    if (!result.data) {
      return { row: null, error: 'save_failed' };
    }
    return { row: result.data, error: null };
  }

  async deleteMemberType(id: string): Promise<{ error: SettingsMutationError | null }> {
    const result = toAccessResult(
      await this.access.from('member_types').delete().eq('id', id),
    );
    if (!result.ok) {
      return { error: typedWriteError(result.error.code) };
    }
    return { error: null };
  }

  async updateAppSettings(
    patch: AppSettingsClientUpdate,
  ): Promise<{ row: AppSettings | null; error: SettingsMutationError | null }> {
    const result = toAccessResult(
      await this.access.from('app_settings').update(patch).eq('id', true).select().single(),
    );
    if (!result.ok) {
      return { row: null, error: typedWriteError(result.error.code) };
    }
    if (!result.data) {
      return { row: null, error: 'save_failed' };
    }
    return { row: result.data, error: null };
  }
}
