"use client";

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/pagination-controls";
import type { ConsumptionRow } from "../_hooks/useReportData";

export interface DetailTableProps {
  rows: ConsumptionRow[];
  loading: boolean;
}

export function DetailTable({ rows, loading }: DetailTableProps) {
  const pagination = usePagination(rows, 50);

  return (
    <section className="enterprise-panel overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 p-5">
        <div>
          <p className="section-eyebrow">Trazabilidad</p>
          <h2 className="text-lg font-black text-white">Detalle por colaborador</h2>
        </div>
        <Badge className="rounded-md border border-white/10 bg-white/5 text-white/60">
          {rows.length} movimientos
        </Badge>
      </div>

      {loading ? (
        <div className="flex h-72 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-red-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-72 items-center justify-center px-6 text-center text-sm font-semibold text-white/45">
          Sin movimientos de consumo para este dia.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="px-5 text-[10px] font-black uppercase tracking-widest text-white/45">Hora</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Colaborador</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Area</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Material</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Motivo</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-white/45">Cantidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedItems.map((row) => (
                <TableRow key={row.id} className="border-white/10 hover:bg-white/[0.03]">
                  <TableCell className="px-5 py-4 font-mono text-xs text-white/55">{row.time}</TableCell>
                  <TableCell className="py-4">
                    <p className="font-bold text-white">{row.employeeName}</p>
                    <p className="mt-1 font-mono text-xs text-white/35">#{row.employeeId}</p>
                  </TableCell>
                  <TableCell className="py-4">
                    <p className="font-semibold text-white/75">{row.area}</p>
                    {row.hasMissingData && (
                      <p className="mt-1 text-xs font-bold text-red-300">Revisar dato maestro</p>
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    <p className="max-w-[280px] truncate font-semibold text-white/80">{row.itemName}</p>
                    <p className="mt-1 font-mono text-xs text-white/35">{row.material} · {row.size}</p>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge className="rounded-md border border-white/10 bg-white/5 text-white/55">
                      {row.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 text-right font-black text-white">
                    {row.quantity} <span className="text-[10px] text-white/40">{row.quantityUnit}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-white/10 px-5">
            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              startIndex={pagination.startIndex}
              endIndex={pagination.endIndex}
              itemsPerPage={pagination.itemsPerPage}
              hasNext={pagination.hasNext}
              hasPrev={pagination.hasPrev}
              onNext={pagination.next}
              onPrev={pagination.prev}
              onSetPage={pagination.setPage}
              onSetItemsPerPage={pagination.setItemsPerPage}
              itemLabel="registros"
            />
          </div>
        </>
      )}
    </section>
  );
}
