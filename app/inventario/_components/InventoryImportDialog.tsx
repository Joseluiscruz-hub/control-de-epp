"use client";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Database, Upload, FileWarning, CheckCircle2, Loader2
} from 'lucide-react';
import { type ParsedInventoryImport } from '@/lib/inventory-import';

export interface InventoryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importingInventory: boolean;
  importFileName: string;
  importPreview: ParsedInventoryImport | null;
  importHasBlockingIssues: boolean;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
  onResetImport: () => void;
}

export function InventoryImportDialog({
  open,
  onOpenChange,
  importingInventory,
  importFileName,
  importPreview,
  importHasBlockingIssues,
  onFileChange,
  onImport,
  onResetImport,
}: InventoryImportDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o && !importingInventory) onResetImport();
      }}
    >
      <DialogContent className="sm:max-w-4xl rounded-[2rem] border border-white/10 p-0 overflow-hidden shadow-2xl bg-[#040813]">
        <div className="bg-white/5 p-8 relative border-b border-white/10">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Database className="h-20 w-20 text-white" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight text-white uppercase">Base Maestra de EPP</DialogTitle>
              <p className="text-white/50 font-medium mt-1">Carga controlada de materiales unitarios o por talla, ubicaciones y stock de planta.</p>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-6 max-h-[72vh] overflow-y-auto">
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Archivo TSV / TXT de inventario</Label>
            <p className="mt-2 text-xs font-medium text-white/40">
              Para materiales sin talla, deja la columna Talla vacía u omítela del archivo.
            </p>
            <Input
              type="file"
              accept=".txt,.tsv,text/plain,text/tab-separated-values"
              onChange={onFileChange}
              disabled={importingInventory}
              className="mt-3 h-14 rounded-xl bg-white/5 border-white/10 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-[#F40009] file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-widest file:text-white hover:file:bg-red-700"
            />
            {importFileName && (
              <div className="mt-4 flex items-center gap-3 text-sm font-bold text-white/70">
                <Upload className="h-4 w-4 text-sky-400" />
                {importFileName}
              </div>
            )}
          </div>

          {importPreview && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="section-eyebrow mb-2">Artículos</p>
                  <p className="text-3xl font-black text-white">{importPreview.summary.itemCount}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="section-eyebrow mb-2">Variantes</p>
                  <p className="text-3xl font-black text-white">{importPreview.summary.variantCount}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="section-eyebrow mb-2">Stock Total</p>
                  <p className="text-3xl font-black text-emerald-400">{importPreview.summary.totalStock.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="section-eyebrow mb-2">Estado</p>
                  <p className={`text-sm font-black uppercase tracking-widest ${importHasBlockingIssues ? 'text-red-400' : 'text-emerald-400'}`}>
                    {importHasBlockingIssues ? 'Bloqueado' : 'Listo'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">Plantas Detectadas</h3>
                  <div className="space-y-3">
                    {Object.entries(importPreview.summary.byPlant).map(([plantName, total]) => (
                      <div key={plantName} className="flex items-center justify-between gap-4">
                        <span className="text-xs font-bold uppercase tracking-widest text-white/65">{plantName}</span>
                        <span className="rounded-lg bg-white/10 px-3 py-1 text-[10px] font-black text-white">{total}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">Categorías Detectadas</h3>
                  <div className="space-y-3">
                    {Object.entries(importPreview.summary.byCategory).map(([categoryName, total]) => (
                      <div key={categoryName} className="flex items-center justify-between gap-4">
                        <span className="text-xs font-bold uppercase tracking-widest text-white/65">{categoryName}</span>
                        <span className="rounded-lg bg-white/10 px-3 py-1 text-[10px] font-black text-white">{total}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">Validación</h3>
                  {importPreview.issues.length === 0 ? (
                    <div className="flex items-center gap-3 text-emerald-400 font-bold text-sm">
                      <CheckCircle2 className="h-5 w-5" />
                      Formato validado sin incidencias.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {importPreview.issues.slice(0, 7).map((issue, index) => (
                        <div key={`${issue.row}-${index}`} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                          <FileWarning className={`mt-0.5 h-4 w-4 ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`} />
                          <div>
                            <p className={`text-[10px] font-black uppercase tracking-widest ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                              Fila {issue.row} · {issue.severity === 'error' ? 'Error' : 'Aviso'}
                            </p>
                            <p className="text-xs font-medium text-white/65 mt-1">{issue.message}</p>
                          </div>
                        </div>
                      ))}
                      {importPreview.issues.length > 7 && (
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                          +{importPreview.issues.length - 7} incidencias adicionales
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300 mb-2">SKU temporales</p>
                <p className="text-sm font-medium leading-relaxed text-white/60">
                  {importPreview.summary.temporarySkuCount} variantes no traen código de material. Se cargarán con SKU temporal estable para completar tallas y se podrán reemplazar cuando tengamos el código real.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-white/10 p-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={importingInventory}
            className="h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] text-white/50 hover:text-white hover:bg-white/10"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onImport}
            disabled={!importPreview || importHasBlockingIssues || importingInventory || importPreview.items.length === 0}
            className="h-12 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest text-xs px-6"
          >
            {importingInventory ? <Loader2 className="h-5 w-5 animate-spin" /> : `Cargar ${importPreview?.summary.itemCount ?? 0} artículos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
