import type { SuiNetwork } from '../sui/sui.types';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface DateRangeParams {
  startMs: number | null;
  endMs: number | null;
}

export interface PaginationResult<T> {
  items: T[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
  };
}

export function parseNetwork(value: unknown): SuiNetwork | undefined {
  if (value === 'devnet' || value === 'testnet' || value === 'mainnet') {
    return value;
  }

  return undefined;
}

export function parseTimeValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

export function parseDateRange(query: Record<string, unknown>): DateRangeParams {
  return {
    startMs: parseTimeValue(query.from ?? query.startMs ?? query.start),
    endMs: parseTimeValue(query.to ?? query.endMs ?? query.end),
  };
}

export function parsePagination(query: Record<string, unknown>, defaults?: { limit?: number; page?: number }) {
  const limit = clampInteger(query.limit, defaults?.limit ?? 20, 1, 100);
  const page = clampInteger(query.page, defaults?.page ?? 1, 1, 10_000);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  } satisfies PaginationParams;
}

export function parseSortOrder(value: unknown): 1 | -1 {
  if (typeof value === 'string' && ['asc', '1', 'true'].includes(value.toLowerCase())) {
    return 1;
  }

  return -1;
}

export function pickSortField(value: unknown, allowedFields: readonly string[], fallback: string) {
  if (typeof value === 'string' && allowedFields.includes(value)) {
    return value;
  }

  return fallback;
}

export function normalizeSearch(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function buildPaginationResult<T>(items: T[], total: number, pagination: PaginationParams): PaginationResult<T> {
  return {
    items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit),
    },
  };
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}
