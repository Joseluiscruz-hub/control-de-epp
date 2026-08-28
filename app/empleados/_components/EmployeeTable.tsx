"use client";

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Eye, UserX, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import type { Employee } from '../_hooks/useEmployeeData';

export interface EmployeeTableProps {
  filtered: Employee[];
  search: string;
  setSearch: (value: string) => void;
  filterStatus: 'all' | 'active' | 'inactive';
  setFilterStatus: (value: 'all' | 'active' | 'inactive') => void;
  onOpenHistory: (emp: Employee) => void;
  onConfirmToggle: (emp: Employee) => void;
}

export function EmployeeTable({
  filtered,
  search,
  setSearch,
  filterStatus,
  setFilterStatus,
  onOpenHistory,
  onConfirmToggle,
}: EmployeeTableProps) {
  const pagination = usePagination(filtered, 20);

  // Reset pagination on filter change
  useEffect(() => {
    pagination.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterStatus]);

  return (
    <>
      {/* ── Filter and Search Bar ────────────────── */}
      <div className="enterprise-panel flex flex-col md:flex-row gap-4 p-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 group-focus-within:text-[#F40009] transition-colors" />
          <Input
            placeholder="Filtrar por nombre, nómina o departamento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-14 h-12 bg-white/5 border-white/10 rounded-lg text-white placeholder:text-white/30 focus-visible:ring-[#F40009] font-medium"
          />
        </div>
        <div className="flex p-1 bg-white/5 rounded-lg gap-1 border border-white/5">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <Button
              key={s}
              variant="ghost"
              onClick={() => setFilterStatus(s)}
              className={`h-10 px-5 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all ${
                filterStatus === s 
                  ? 'bg-white/15 text-white shadow-lg' 
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              {s === 'all' ? 'Ver Todos' : s === 'active' ? 'Solo Activos' : 'Solo Bajas'}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Corporate Table View ─────────────────── */}
      <div className="enterprise-panel">
        <div className="overflow-x-auto">
          <table className="w-full premium-table">
            <thead>
              <tr className="bg-white/5 text-left border-b border-white/10">
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Identificación</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Nombre Completo</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Unidad / Área</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Estatus</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-right">Controles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout">
                {pagination.paginatedItems.map((emp, idx) => (
                  <motion.tr 
                    layout
                    key={emp.docId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(idx, 10) * 0.03 }}
                    className="group hover:bg-white/[0.02] transition-colors cursor-default"
                  >
                    <td className="px-8 py-6 font-bold text-white/90 font-mono tracking-tight text-lg">#{emp.id}</td>
                    <td className="px-8 py-6">
                       <p className="font-bold text-white text-lg tracking-tight">{emp.name}</p>
                       <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                         {emp.position || emp.jobFunction || 'Colaborador ORSTED CORP'}
                       </p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col items-start gap-2">
                        <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 font-bold text-[10px] tracking-widest uppercase text-white/70">
                          {emp.area}
                        </span>
                        {emp.personnelArea && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">
                            {emp.personnelArea}
                          </span>
                        )}
                        {emp.costCenter && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-amber-200/60">
                            Centro de costos: {emp.costCenter}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-xl border font-bold text-[10px] uppercase tracking-widest ${
                        emp.active 
                          ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' 
                          : 'text-red-400 bg-red-400/10 border-red-400/20'
                      }`}>
                        <div className={`h-1.5 w-1.5 rounded-full ${emp.active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                        {emp.active ? 'Activo' : 'Inactivo'}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm" variant="ghost"
                          className="h-10 px-4 rounded-xl bg-white/5 hover:bg-[#F40009]/20 hover:text-[#F40009] text-white/70 font-bold uppercase tracking-wider text-[10px] transition-all"
                          onClick={() => onOpenHistory(emp)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-2" />
                          EXPEDIENTE
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-10 w-10 rounded-xl transition-all ${
                            emp.active
                              ? 'text-red-400 hover:bg-red-500 hover:text-white'
                              : 'text-emerald-400 hover:bg-emerald-500 hover:text-white'
                          }`}
                          onClick={() => onConfirmToggle(emp)}
                          title={emp.active ? "Dar de baja" : "Reactivar"}
                        >
                          {emp.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* ── Pagination ─────────────────────────── */}
        <div className="px-6 py-2 border-t border-white/5">
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
            itemLabel="colaboradores"
          />
        </div>
      </div>
    </>
  );
}
