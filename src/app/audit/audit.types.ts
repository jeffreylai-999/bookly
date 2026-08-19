import type { Tables } from '../core/supabase';

export type AuditLogRow = Tables<'audit_log'>;

export type AuditActorRef = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'email'>;

export type AuditListItem = AuditLogRow & {
  actor_profile: AuditActorRef | null;
};

export interface AuditListQuery {
  page: number;
  pageSize: number;
  actorId: string | 'all';
  action: string | 'all';
  entityType: string | 'all';
  /** Inclusive start date `YYYY-MM-DD`, or empty. */
  fromDate: string;
  /** Inclusive end date `YYYY-MM-DD`, or empty. */
  toDate: string;
}

export interface AuditListResult {
  rows: AuditListItem[];
  total: number;
}

/** Machine action codes known to the UI (localized in `audit.actionCodes.*`). */
export const AUDIT_ACTION_CODES = [
  'member.create',
  'member.update',
  'member.status',
  'title.create',
  'title.update',
  'copy.create',
  'copy.update',
  'copy.set_status',
  'loan.checkout',
  'loan.checkin',
  'loan.renew',
  'hold.place',
  'hold.cancel',
  'hold.mark_ready',
  'fine.waive',
  'payment.record',
  'payment.void',
  'member_type.create',
  'member_type.update',
  'member_type.delete',
  'settings.update',
] as const;

export type AuditActionCode = (typeof AUDIT_ACTION_CODES)[number];

export const AUDIT_ENTITY_TYPES = [
  'member',
  'title',
  'copy',
  'loan',
  'hold',
  'fine',
  'payment',
  'member_type',
  'app_settings',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** Transloco key for a machine action code, e.g. `member.create` → `audit.actionCodes.member.create`. */
export function auditActionLabelKey(action: string): string {
  return `audit.actionCodes.${action}`;
}

export type JsonHighlightKind =
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'punctuation'
  | 'plain';

export interface JsonHighlightToken {
  kind: JsonHighlightKind;
  text: string;
}

/** Pretty-print audit detail JSON for the inspect dialog. */
export function formatAuditDetail(detail: unknown): string {
  try {
    return JSON.stringify(detail ?? {}, null, 2);
  } catch {
    return String(detail);
  }
}

/** Tokenize pretty-printed JSON so the inspect dialog can color keys and values. */
export function highlightJson(detail: unknown): JsonHighlightToken[] {
  return tokenizePrettyJson(formatAuditDetail(detail));
}

function tokenizePrettyJson(src: string): JsonHighlightToken[] {
  const tokens: JsonHighlightToken[] = [];
  let i = 0;

  const push = (kind: JsonHighlightKind, text: string): void => {
    if (!text) {
      return;
    }
    const last = tokens.at(-1);
    if (last && last.kind === kind) {
      last.text += text;
      return;
    }
    tokens.push({ kind, text });
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      let j = i + 1;
      while (
        j < src.length &&
        (src[j] === ' ' || src[j] === '\n' || src[j] === '\r' || src[j] === '\t')
      ) {
        j++;
      }
      push('plain', src.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ':' || ch === ',') {
      push('punctuation', ch);
      i++;
      continue;
    }

    if (ch === '"') {
      const end = endOfJsonString(src, i);
      const text = src.slice(i, end);
      let k = end;
      while (
        k < src.length &&
        (src[k] === ' ' || src[k] === '\n' || src[k] === '\r' || src[k] === '\t')
      ) {
        k++;
      }
      push(src[k] === ':' ? 'key' : 'string', text);
      i = end;
      continue;
    }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (match) {
        push('number', match[0]);
        i += match[0].length;
        continue;
      }
    }

    if (src.startsWith('true', i) && !isIdentContinue(src[i + 4])) {
      push('boolean', 'true');
      i += 4;
      continue;
    }
    if (src.startsWith('false', i) && !isIdentContinue(src[i + 5])) {
      push('boolean', 'false');
      i += 5;
      continue;
    }
    if (src.startsWith('null', i) && !isIdentContinue(src[i + 4])) {
      push('null', 'null');
      i += 4;
      continue;
    }

    push('plain', ch);
    i++;
  }

  return tokens;
}

function endOfJsonString(src: string, start: number): number {
  let i = start + 1;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === '"') {
      return i + 1;
    }
    i++;
  }
  return src.length;
}

function isIdentContinue(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}
