"use client";

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Package, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { playNotificationSound } from '@/lib/notification-sounds';
import { plantLabel } from '@/lib/plants';
import { downloadSolpedCsv } from '@/lib/solped-export';
import { useInventoryData } from './_hooks/useInventoryData';
import { InventoryStatsGrid } from './_components/InventoryStatsGrid';
import { CatalogTable } from './_components/CatalogTable';
import { AddItemDialog } from './_components/AddItemDialog';
import { InventoryImportDialog } from './_components/InventoryImportDialog';
import { AdjustStockDialog } from './_components/AdjustStockDialog';
import { ReorderAlertBanner } from './_components/ReorderAlertBanner';

export default function InventarioPage() {
  const data = useInventoryData();
  const warnedReorderKey = useRef('');

  useEffect(() => {
    if (data.reorderAlerts.length === 0) return;
    const key = data.reorderAlerts
      .map((alert) => `${alert.material}:${alert.size ?? ''}:${alert.stock}:${alert.reorderPoint}`)
      .join('|');
    if (key === warnedReorderKey.current) return;
    warnedReorderKey.current = key;
    playNotificationSound('solped');
    toast.warning('SOLPED requerida', {
      description: `${data.reorderAlerts.length} material(es) alcanzaron su punto de pedido.`,
    });
  }, [data.reorderAlerts]);

  const handleDownloadSolped = () => {
    const downloaded = downloadSolpedCsv(data.reorderAlerts, {
      plantName: plantLabel(data.plantId),
    });

    if (!downloaded) {
      toast.error('No hay materiales para descargar en SOLPED.');
      return;
    }

    playNotificationSound('success');
    toast.success('SOLPED descargada.');
  };

  return (
    <div className="space-y-6 pb-20">

      {/* ── Hero ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="enterprise-panel p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6"
      >
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-[#F40009] flex items-center justify-center shadow-xl shadow-red-950/30">
            <Package className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight uppercase text-white">Inventario EPP</h1>
            <p className="section-eyebrow mt-1">Catálogo central de equipo de protección personal</p>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={() => data.setImportOpen(true)}
            variant="ghost"
            className="h-12 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-widest text-[10px] px-5"
          >
            <Upload className="h-4 w-4 mr-2" /> Carga Masiva
          </Button>
          <Button
            onClick={() => data.setAddOpen(true)}
            className="h-12 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest text-[10px] px-5"
          >
            <Plus className="h-4 w-4 mr-2" /> Nuevo Artículo
          </Button>
        </div>
      </motion.div>

      {/* ── Stats Grid ────────────────────────────── */}
      <InventoryStatsGrid
        lowStockCount={data.lowStockItems.length}
        outOfStockCount={data.outOfStock.length}
        reorderCount={data.reorderAlerts.length}
        totalStock={data.totalStock}
      />

      <ReorderAlertBanner
        alerts={data.reorderAlerts}
        onReview={() => data.setFilterStock('reorder')}
        onDownload={handleDownloadSolped}
      />

      {/* ── Table with Search/Filter + Pagination ── */}
      <CatalogTable
        filtered={data.filtered}
        search={data.search}
        setSearch={data.setSearch}
        filterCategory={data.filterCategory}
        setFilterCategory={data.setFilterCategory}
        filterStock={data.filterStock}
        setFilterStock={data.setFilterStock}
        uniqueCategories={data.uniqueCategories}
        reorderAlertByDocId={data.reorderAlertByDocId}
        onAdjust={data.openAdjust}
      />

      {/* ── Dialogs ───────────────────────────────── */}
      <AddItemDialog
        open={data.addOpen}
        onOpenChange={data.setAddOpen}
        form={data.form}
        setForm={data.setForm}
        saving={data.saving}
        onSubmit={data.handleAdd}
      />

      <InventoryImportDialog
        open={data.importOpen}
        onOpenChange={data.setImportOpen}
        importFileName={data.importFileName}
        importPreview={data.importPreview}
        importingInventory={data.importingInventory}
        importHasBlockingIssues={data.importHasBlockingIssues}
        onFileChange={data.handleInventoryFile}
        onImport={data.importInventoryBase}
        onResetImport={data.resetInventoryImport}
      />

      <AdjustStockDialog
        open={data.adjustOpen}
        onOpenChange={data.setAdjustOpen}
        adjustItem={data.adjustItem}
        adjustQty={data.adjustQty}
        setAdjustQty={data.setAdjustQty}
        adjustType={data.adjustType}
        setAdjustType={data.setAdjustType}
        adjustSize={data.adjustSize}
        setAdjustSize={data.setAdjustSize}
        adjustSaving={data.adjustSaving}
        onSubmit={data.handleAdjust}
      />
    </div>
  );
}
