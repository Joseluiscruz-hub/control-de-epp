"use client";

import { useState, useMemo, useCallback } from "react";

export interface UsePaginationReturn<T> {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Items for the current page */
  paginatedItems: T[];
  /** Total items count (before pagination) */
  totalItems: number;
  /** Items per page */
  itemsPerPage: number;
  /** Go to next page */
  next: () => void;
  /** Go to previous page */
  prev: () => void;
  /** Jump to a specific page */
  setPage: (page: number) => void;
  /** Change items per page (resets to page 1) */
  setItemsPerPage: (count: number) => void;
  /** Whether there's a next page */
  hasNext: boolean;
  /** Whether there's a previous page */
  hasPrev: boolean;
  /** Start index of current page (0-based, for display: startIndex + 1) */
  startIndex: number;
  /** End index of current page (0-based, inclusive) */
  endIndex: number;
}

export function usePagination<T>(
  items: T[],
  initialPerPage = 20
): UsePaginationReturn<T> {
  const [page, setPageRaw] = useState(1);
  const [itemsPerPage, setItemsPerPageRaw] = useState(initialPerPage);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  // Clamp page if items change and current page is out of bounds
  const safePage = Math.min(page, totalPages);

  const startIndex = (safePage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage - 1, totalItems - 1);

  const paginatedItems = useMemo(
    () => items.slice(startIndex, startIndex + itemsPerPage),
    [items, startIndex, itemsPerPage]
  );

  const setPage = useCallback(
    (p: number) => setPageRaw(Math.max(1, Math.min(p, totalPages))),
    [totalPages]
  );

  const next = useCallback(() => setPage(safePage + 1), [safePage, setPage]);
  const prev = useCallback(() => setPage(safePage - 1), [safePage, setPage]);

  const setItemsPerPage = useCallback((count: number) => {
    setItemsPerPageRaw(count);
    setPageRaw(1);
  }, []);

  return {
    page: safePage,
    totalPages,
    paginatedItems,
    totalItems,
    itemsPerPage,
    next,
    prev,
    setPage,
    setItemsPerPage,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
    startIndex,
    endIndex,
  };
}
