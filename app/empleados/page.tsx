"use client";

import { motion } from 'motion/react';
import { Users, Plus, Upload, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEmployeeData } from './_hooks/useEmployeeData';
import { EmployeeStatsGrid } from './_components/EmployeeStatsGrid';
import { EmployeeTable } from './_components/EmployeeTable';
import { AddEmployeeDialog } from './_components/AddEmployeeDialog';
import { PersonnelImportDialog } from './_components/PersonnelImportDialog';
import { EmployeeHistoryDialog } from './_components/EmployeeHistoryDialog';
import { ConfirmToggleDialog } from './_components/ConfirmToggleDialog';

export default function EmpleadosPage() {
  const data = useEmployeeData();

  return (
    <div className="space-y-6 pb-20">

      {/* ── Hero ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="enterprise-panel enterprise-hero p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6"
      >
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-[#F40009] flex items-center justify-center shadow-xl shadow-red-950/30">
            <Users className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight uppercase text-white">Nómina Activa</h1>
            <p className="section-eyebrow mt-1">Control y gestión del personal operativo FEMSA</p>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={() => data.setImportOpen(true)}
            variant="ghost"
            className="h-12 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-widest text-[10px] px-5"
          >
            <Upload className="h-4 w-4 mr-2" /> Base de Personal
          </Button>
          <Button
            onClick={data.syncKioskEmployees}
            disabled={data.syncingKiosk || data.employees.length === 0}
            variant="ghost"
            className="h-12 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-widest text-[10px] px-5"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${data.syncingKiosk ? 'animate-spin' : ''}`} /> Sync Kiosko
          </Button>
          <Button
            onClick={() => data.setAddOpen(true)}
            className="h-12 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest text-[10px] px-5"
          >
            <Plus className="h-4 w-4 mr-2" /> Alta Individual
          </Button>
        </div>
      </motion.div>

      {/* ── Stats Grid ────────────────────────────── */}
      <EmployeeStatsGrid
        total={data.employees.length}
        activeCount={data.activeCount}
        inactiveCount={data.inactiveCount}
      />

      {/* ── Table with Search/Filter + Pagination ── */}
      <EmployeeTable
        filtered={data.filtered}
        search={data.search}
        setSearch={data.setSearch}
        filterStatus={data.filterStatus}
        setFilterStatus={data.setFilterStatus}
        onOpenHistory={data.openHistory}
        onConfirmToggle={(emp) => data.setConfirmToggle(emp)}
      />

      {/* ── Dialogs ───────────────────────────────── */}
      <AddEmployeeDialog
        open={data.addOpen}
        onOpenChange={data.setAddOpen}
        form={data.form}
        setForm={data.setForm}
        saving={data.saving}
        onSubmit={data.handleAdd}
      />

      <PersonnelImportDialog
        open={data.importOpen}
        onOpenChange={data.setImportOpen}
        importFileName={data.importFileName}
        importPreview={data.importPreview}
        importingPersonnel={data.importingPersonnel}
        importHasBlockingIssues={data.importHasBlockingIssues}
        onFileChange={data.handlePersonnelFile}
        onImport={data.importPersonnelBase}
        onReset={data.resetPersonnelImport}
      />

      <EmployeeHistoryDialog
        open={data.historyOpen}
        onOpenChange={data.setHistoryOpen}
        selectedEmployee={data.selectedEmployee}
        history={data.history}
        historyLoading={data.historyLoading}
      />

      <ConfirmToggleDialog
        employee={data.confirmToggle}
        onClose={() => data.setConfirmToggle(null)}
        onConfirm={data.toggleStatus}
      />
    </div>
  );
}
