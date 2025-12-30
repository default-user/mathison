/**
 * P4-C1: Universal Pagination Primitives
 * Bounded + deterministic pagination utilities with hard caps
 */

export interface PaginationConfig {
  /** Minimum limit value (inclusive) */
  minLimit: number;
  /** Maximum limit value (inclusive) */
  maxLimit: number;
  /** Default limit if not specified */
  defaultLimit: number;
  /** Minimum depth value for traversal (inclusive) */
  minDepth: number;
  /** Maximum depth value for traversal (inclusive) */
  maxDepth: number;
  /** Default depth for traversal */
  defaultDepth: number;
  /** Minimum query length (inclusive) */
  minQueryLength: number;
  /** Maximum query length (inclusive) */
  maxQueryLength: number;
}

/**
 * Global pagination caps enforced across all endpoints
 * Treaty Rule 8: Honest limits - bounded queries only
 */
export const PAGINATION_BOUNDS: PaginationConfig = {
  minLimit: 1,
  maxLimit: 200,
  defaultLimit: 50,
  minDepth: 1,
  maxDepth: 3,
  defaultDepth: 1,
  minQueryLength: 1,
  maxQueryLength: 256
};

export interface ParsedLimit {
  value: number;
  isDefault: boolean;
}

export interface ParsedDepth {
  value: number;
  isDefault: boolean;
}

export interface ParsedCursor {
  offset: number;
  isValid: boolean;
}

/**
 * Parse and validate limit parameter with bounded constraints
 * @param limitParam - Raw limit parameter from query string
 * @param config - Optional custom config (defaults to PAGINATION_BOUNDS)
 * @returns Validated limit with default flag
 * @throws Error with user-friendly message if invalid
 */
export function parseLimit(
  limitParam: string | undefined,
  config: PaginationConfig = PAGINATION_BOUNDS
): ParsedLimit {
  // Return default if not provided
  if (!limitParam) {
    return {
      value: config.defaultLimit,
      isDefault: true
    };
  }

  const parsed = parseInt(limitParam, 10);

  // Validate numeric
  if (isNaN(parsed)) {
    throw new Error(
      `Invalid limit parameter: must be a number between ${config.minLimit} and ${config.maxLimit}`
    );
  }

  // Validate bounds
  if (parsed < config.minLimit || parsed > config.maxLimit) {
    throw new Error(
      `Invalid limit parameter: must be between ${config.minLimit} and ${config.maxLimit} (got ${parsed})`
    );
  }

  return {
    value: parsed,
    isDefault: false
  };
}

/**
 * Parse and validate depth parameter for traversal with bounded constraints
 * @param depthParam - Raw depth parameter from query string
 * @param config - Optional custom config (defaults to PAGINATION_BOUNDS)
 * @returns Validated depth with default flag
 * @throws Error with user-friendly message if invalid
 */
export function parseDepth(
  depthParam: string | undefined,
  config: PaginationConfig = PAGINATION_BOUNDS
): ParsedDepth {
  // Return default if not provided
  if (!depthParam) {
    return {
      value: config.defaultDepth,
      isDefault: true
    };
  }

  const parsed = parseInt(depthParam, 10);

  // Validate numeric
  if (isNaN(parsed)) {
    throw new Error(
      `Invalid depth parameter: must be a number between ${config.minDepth} and ${config.maxDepth}`
    );
  }

  // Validate bounds
  if (parsed < config.minDepth || parsed > config.maxDepth) {
    throw new Error(
      `Invalid depth parameter: must be between ${config.minDepth} and ${config.maxDepth} (got ${parsed})`
    );
  }

  return {
    value: parsed,
    isDefault: false
  };
}

/**
 * Parse and validate cursor parameter for pagination
 * Cursors are opaque offset-based tokens (base64-encoded JSON)
 * @param cursorParam - Raw cursor parameter from query string
 * @returns Parsed cursor with validity flag
 */
export function parseCursor(cursorParam: string | undefined): ParsedCursor {
  // No cursor means start from beginning
  if (!cursorParam) {
    return {
      offset: 0,
      isValid: true
    };
  }

  try {
    // Decode base64 cursor
    const decoded = Buffer.from(cursorParam, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);

    // Validate cursor structure
    if (typeof parsed.offset !== 'number' || parsed.offset < 0) {
      return {
        offset: 0,
        isValid: false
      };
    }

    return {
      offset: parsed.offset,
      isValid: true
    };
  } catch (error) {
    // Invalid cursor format
    return {
      offset: 0,
      isValid: false
    };
  }
}

/**
 * Generate opaque cursor for next page
 * @param offset - Numeric offset for next page
 * @returns Base64-encoded cursor string
 */
export function generateCursor(offset: number): string {
  const cursorData = JSON.stringify({ offset });
  return Buffer.from(cursorData, 'utf-8').toString('base64');
}

/**
 * Validate query string length with bounded constraints
 * @param query - Raw query string
 * @param config - Optional custom config (defaults to PAGINATION_BOUNDS)
 * @returns Validated query string
 * @throws Error with user-friendly message if invalid
 */
export function validateQueryLength(
  query: string,
  config: PaginationConfig = PAGINATION_BOUNDS
): string {
  const trimmed = query.trim();

  if (trimmed.length < config.minQueryLength) {
    throw new Error(
      `Query too short: must be at least ${config.minQueryLength} character(s)`
    );
  }

  if (trimmed.length > config.maxQueryLength) {
    throw new Error(
      `Query too long: must be at most ${config.maxQueryLength} characters (got ${trimmed.length})`
    );
  }

  return trimmed;
}

/**
 * Stable sort strategy for deterministic ordering
 * Sorts items by ID to ensure consistent results across calls
 * @param items - Array of items with 'id' property
 * @returns Sorted array (does not mutate original)
 */
export function stableSort<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Apply pagination to sorted items and generate next cursor if needed
 * @param items - Sorted array of items
 * @param offset - Current offset
 * @param limit - Page size
 * @returns Paginated results with optional next_cursor
 */
export function paginate<T>(
  items: T[],
  offset: number,
  limit: number
): { results: T[]; next_cursor?: string } {
  const page = items.slice(offset, offset + limit);
  const hasMore = items.length > offset + limit;

  return {
    results: page,
    next_cursor: hasMore ? generateCursor(offset + limit) : undefined
  };
}
