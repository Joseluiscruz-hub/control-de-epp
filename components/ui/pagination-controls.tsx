"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  itemsPerPage: number;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSetPage: (page: number) => void;
  onSetItemsPerPage: (count: number) => void;
  itemLabel?: string;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  itemsPerPage,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  onSetPage,
  onSetItemsPerPage,
  itemLabel = "registros",
}: PaginationControlsProps) {
  if (totalItems <= 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-3">
      {/* Info */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/40">
          Mostrando{" "}
          <span className="text-white/70 font-semibold">
            {startIndex + 1}–{Math.min(endIndex + 1, totalItems)}
          </span>{" "}
          de{" "}
          <span className="text-white/70 font-semibold">{totalItems}</span>{" "}
          {itemLabel}
        </span>

        {/* Page size selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/30 uppercase tracking-wider hidden sm:inline">
            Por página:
          </span>
          <div
            className="flex items-center rounded-md overflow-hidden"
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                onClick={() => onSetItemsPerPage(size)}
                className={`px-2 py-1 text-[10px] font-bold transition-all ${
                  itemsPerPage === size
                    ? "bg-[rgba(244,0,9,0.15)] text-[#F40009]"
                    : "text-white/30 hover:text-white/60 hover:bg-white/5"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrev}
          disabled={!hasPrev}
          className="h-7 w-7 rounded-md text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {/* Page numbers */}
        <div className="flex items-center gap-0.5">
          {generatePageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span
                key={`ellipsis-${i}`}
                className="px-1 text-[10px] text-white/20"
              >
                ···
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onSetPage(p as number)}
                className={`h-7 min-w-[28px] px-1.5 rounded-md text-xs font-semibold transition-all ${
                  p === page
                    ? "text-white shadow-sm"
                    : "text-white/30 hover:text-white/70 hover:bg-white/5"
                }`}
                style={
                  p === page
                    ? {
                        background: "rgba(244,0,9,0.16)",
                        border: "1px solid rgba(244,0,9,0.28)",
                      }
                    : {}
                }
              >
                {p}
              </button>
            )
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          disabled={!hasNext}
          className="h-7 w-7 rounded-md text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed"
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Generate an array of page numbers with ellipsis for large page counts */
function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push("...");

  pages.push(total);

  return pages;
}
