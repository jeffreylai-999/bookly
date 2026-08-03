import { Service, inject } from '@angular/core';

import {
  SUPABASE_CLIENT,
  type AppSettingsClientUpdate,
  type MemberTypesClientInsert,
  type MemberTypesClientUpdate,
} from '../core/supabase';
import type { AppSettings, MemberType, SettingsMutationError } from './settings.types';

interface WriteResult {
  error: string | null;
  code: string | null;
}

/** Postgres/PostgREST write failure → typed settings error. */
export function mapWriteError(result: WriteResult): SettingsMutationError {
  if (result.code === '23505') {
    return 'name_taken';
  }
  if (result.code === '23503') {
    return 'member_type_in_use';
  }
  return 'save_failed';
}

@Service()
export class SettingsRepository {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async listMemberTypes(): Promise<{ rows: MemberType[]; error: string | null }> {
    const { data, error } = await this.supabase
      .from('member_types')
      .select('*')
      .order('name', { ascending: true });
    return { rows: data ?? [], error: error?.message ?? null };
  }

  async getAppSettings(): Promise<{ row: AppSettings | null; error: string | null }> {
    const { data, error } = await this.supabase
      .from('app_settings')
      .select('*')
      .eq('id', true)
      .single();
    return { row: data ?? null, error: error?.message ?? null };
  }

  async createMemberType(
    input: MemberTypesClientInsert,
  ): Promise<{ row: MemberType | null; error: string | null; code: string | null }> {
    const { data, error } = await this.supabase
      .from('member_types')
      .insert(input)
      .select()
      .single();
    return {
      row: data ?? null,
      error: error?.message ?? null,
      code: error?.code ?? null,
    };
  }

  async updateMemberType(
    id: string,
    patch: MemberTypesClientUpdate,
  ): Promise<{ row: MemberType | null; error: string | null; code: string | null }> {
    const { data, error } = await this.supabase
      .from('member_types')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    return {
      row: data ?? null,
      error: error?.message ?? null,
      code: error?.code ?? null,
    };
  }

  async deleteMemberType(id: string): Promise<WriteResult> {
    const { error } = await this.supabase.from('member_types').delete().eq('id', id);
    return { error: error?.message ?? null, code: error?.code ?? null };
  }

  async updateAppSettings(
    patch: AppSettingsClientUpdate,
  ): Promise<{ row: AppSettings | null; error: string | null; code: string | null }> {
    const { data, error } = await this.supabase
      .from('app_settings')
      .update(patch)
      .eq('id', true)
      .select()
      .single();
    return {
      row: data ?? null,
      error: error?.message ?? null,
      code: error?.code ?? null,
    };
  }
}
