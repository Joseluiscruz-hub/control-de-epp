"use client";

import {
  CalendarDays,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PeriodMode } from "../_hooks/useReportData";

export interface ReportHeaderProps {
  periodMode: PeriodMode;
  setPeriodMode: (mode: PeriodMode) => void;
  selectedDate: string;
  setSelectedDate: (v: string) => void;
  selectedMonth: string;
  setSelectedMonth: (v: string) => void;
  selectedYear: string;
  setSelectedYear: (v: string) => void;
  rangeStart: string;
  setRangeStart: (v: string) => void;
  rangeEnd: string;
  setRangeEnd: (v: string) => void;
  periodLabel: string;
  loading: boolean;
  onRefresh: () => void;
}

export function ReportHeader({
  periodMode,
  setPeriodMode,
  selectedDate,
  setSelectedDate,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  rangeStart,
  setRangeStart,
  rangeEnd,
  setRangeEnd,
  periodLabel,
  loading,
  onRefresh,
}: ReportHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-300">
          <FileSpreadsheet className="h-6 w-6" />
        </div>
        <div>
          <p className="section-eyebrow">Bajas SAP</p>
          <h1 className="text-2xl font-black tracking-tight text-white">Reporte de Consumo EPP</h1>
          <p className="mt-1 text-sm font-semibold text-white/45">{periodLabel}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={periodMode}
          onChange={(event) => setPeriodMode(event.target.value as PeriodMode)}
          className="h-10 rounded-lg border border-white/10 bg-[#111827] px-3 text-sm font-bold text-white outline-none"
        >
          <option value="day">Diario</option>
          <option value="month">Mensual</option>
          <option value="year">Anual</option>
          <option value="range">Rango</option>
        </select>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          {periodMode === "day" && (
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-10 rounded-lg border-white/10 bg-white/5 pl-10 font-bold text-white"
            />
          )}
          {periodMode === "month" && (
            <Input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-10 rounded-lg border-white/10 bg-white/5 pl-10 font-bold text-white"
            />
          )}
          {periodMode === "year" && (
            <Input
              type="number"
              value={selectedYear}
              min="2020"
              max="2100"
              onChange={(event) => setSelectedYear(event.target.value)}
              className="h-10 w-28 rounded-lg border-white/10 bg-white/5 pl-10 font-bold text-white"
            />
          )}
        </div>
        {periodMode === "range" && (
          <div className="flex gap-2">
            <Input
              type="date"
              value={rangeStart}
              onChange={(event) => setRangeStart(event.target.value)}
              className="h-10 rounded-lg border-white/10 bg-white/5 font-bold text-white"
            />
            <Input
              type="date"
              value={rangeEnd}
              onChange={(event) => setRangeEnd(event.target.value)}
              className="h-10 rounded-lg border-white/10 bg-white/5 font-bold text-white"
            />
          </div>
        )}
        <Button
          variant="outline"
          className="h-10 rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>
    </div>
  );
}
