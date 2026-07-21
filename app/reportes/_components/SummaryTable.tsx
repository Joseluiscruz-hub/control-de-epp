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
import type { SummaryRow } from "../_hooks/useReportData";

export interface SummaryTableProps {
  summaryRows: SummaryRow[];
  loading: boolean;
}

export function SummaryTable({ summaryRows, loading }: SummaryTableProps) {
  return (
    <div className="enterprise-panel overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 p-5">
        <div>
          <p className="section-eyebrow">Consolidado</p>
          <h2 className="text-lg font-black text-white">Material por area</h2>
        </div>
        <Badge className="rounded-md border border-white/10 bg-white/5 text-white/60">
          {summaryRows.length} lineas
        </Badge>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-red-400" />
        </div>
      ) : summaryRows.length === 0 ? (
        <div className="flex h-64 items-center justify-center px-6 text-center text-sm font-semibold text-white/45">
          Sin consumos registrados para este corte.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="px-5 text-[10px] font-black uppercase tracking-widest text-white/45">Material</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Area</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Talla</TableHead>
              <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-white/45">Cantidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaryRows.map((row) => (
              <TableRow key={row.key} className="border-white/10 hover:bg-white/[0.03]">
                <TableCell className="px-5 py-4">
                  <div className="max-w-[380px]">
                    <p className="font-bold text-white">{row.itemName}</p>
                    <p className="mt-1 font-mono text-xs text-white/40">{row.material}</p>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <p className="font-semibold text-white/75">{row.area}</p>
                  {row.costCenter && <p className="mt-1 text-xs text-white/35">CECO {row.costCenter}</p>}
                </TableCell>
                <TableCell className="py-4 text-white/60">{row.size}</TableCell>
                <TableCell className="py-4 text-right">
                  <span className="inline-flex min-w-12 justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 font-black text-emerald-200">
                    {row.quantity} {row.quantityUnit}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
