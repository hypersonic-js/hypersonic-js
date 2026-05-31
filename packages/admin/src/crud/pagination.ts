import type { AdminPaginationMeta, PaginationParams } from '../types.js'
import { DEFAULT_PER_PAGE, MAX_PER_PAGE } from '../constants.js'

/**
 * Parses pagination query parameters from an Express request query object.
 * Applies sensible defaults and clamps values to safe ranges.
 */
export function parsePaginationParams(query: Record<string, unknown>): PaginationParams {
  const rawPage = Number(query['page'])
  const rawPerPage = Number(query['perPage'])

  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1

  const perPage =
    Number.isFinite(rawPerPage) && rawPerPage >= 1
      ? Math.min(Math.floor(rawPerPage), MAX_PER_PAGE)
      : DEFAULT_PER_PAGE

  return {
    page,
    perPage,
    skip: (page - 1) * perPage,
    take: perPage,
  }
}

/**
 * Builds pagination metadata from raw page/perPage/total values.
 */
export function buildPaginationMeta(
  page: number,
  perPage: number,
  total: number,
): AdminPaginationMeta {
  return {
    page,
    perPage,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / perPage),
  }
}
