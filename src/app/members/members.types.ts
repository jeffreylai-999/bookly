import type { Enums, Tables } from '../core/supabase';

export type MemberStatus = Enums<'member_status'>;
export type Member = Tables<'members'>;
export type MemberType = Tables<'member_types'>;

export type MemberTypeRef = Pick<MemberType, 'id' | 'name'>;

export type MemberListItem = Member & {
  member_type: MemberTypeRef | null;
};

export interface MembersListQuery {
  page: number;
  pageSize: number;
  nameSearch: string;
  status: MemberStatus | 'all';
}

export interface MembersListResult {
  rows: MemberListItem[];
  total: number;
}

export interface MemberFormValue {
  name: string;
  memberTypeId: string;
  email: string;
  phone: string;
  cardBarcode: string;
}

export const MEMBER_CARD_PREFIX = 'MBR-';
export const MEMBER_CARD_PATTERN = /^MBR-.+/;

export function statusBadgeTone(
  status: MemberStatus,
): 'success' | 'danger' | 'neutral' {
  switch (status) {
    case 'active':
      return 'success';
    case 'suspended':
    case 'blocked':
      return 'danger';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
