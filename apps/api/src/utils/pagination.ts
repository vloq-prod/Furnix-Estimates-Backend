export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function resolvePagination(page = 1, pageSize = 20): PaginationParams {
  const safePage = Math.max(1, Math.trunc(page));
  const safeSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize, take: safeSize };
}

/** Whitelist sort columns. Never interpolate a client string into orderBy. */
export function resolveSort<T extends string>(
  requested: string | undefined,
  allowed: readonly T[],
  fallback: T,
  direction: 'asc' | 'desc' = 'desc',
): { field: T; direction: 'asc' | 'desc' } {
  const field = allowed.includes(requested as T) ? (requested as T) : fallback;
  return { field, direction: direction === 'asc' ? 'asc' : 'desc' };
}
