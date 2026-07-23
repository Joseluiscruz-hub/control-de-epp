"use client";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  AlertTriangle, CheckCircle2, Loader2, PackagePlus, Search
} from 'lucide-react';
import type { ManualCatalogLookupState } from '../_hooks/useInventoryData';

export interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  catalogLookup: ManualCatalogLookupState;
  form: {
    sku: string;
    material: string;
    name: string;
    category: string;
    replacementDays: string;
    stock: string;
    minStock: string;
    location: string;
    unit: string;
    unitCost: string;
  };
  setForm: (form: AddItemDialogProps['form']) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AddItemDialog({
  open,
  onOpenChange,
  saving,
  catalogLookup,
  form,
  setForm,
  onSubmit,
}: AddItemDialogProps) {
  const lookupReady = catalogLookup.status === 'found';
  const lookupProblem =
    catalogLookup.status === 'error' ||
    catalogLookup.status === 'duplicate';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] rounded-[2rem] border border-white/10 p-0 overflow-hidden bg-[#040813]">
        <div className="bg-white/5 p-8 relative border-b border-white/10">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <PackagePlus className="h-20 w-20 text-white" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight uppercase text-white">
              Alta de Material
            </DialogTitle>
            <p className="text-white/50 font-medium mt-1">
              El SKU controla el nombre, categoría y vigencia del artículo.
            </p>
          </DialogHeader>
        </div>

        <form onSubmit={onSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              Código SKU obligatorio
            </Label>
            <div className="relative">
              <Input
                autoFocus
                required
                maxLength={32}
                autoComplete="off"
                className="h-12 rounded-xl bg-white/5 border-white/10 pr-12 text-white font-bold focus-visible:ring-[#F40009]"
                value={form.sku}
                onChange={(event) => setForm({
                  ...form,
                  sku: event.target.value.toUpperCase(),
                })}
                placeholder="Ej: 26149605 o 2KPM0"
                aria-describedby="manual-sku-status"
              />
              <div className="absolute inset-y-0 right-4 flex items-center">
                {catalogLookup.status === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                ) : lookupReady ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : lookupProblem ? (
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                ) : (
                  <Search className="h-4 w-4 text-white/30" />
                )}
              </div>
            </div>
            <p
              id="manual-sku-status"
              className={
                lookupReady
                  ? 'text-xs font-medium text-emerald-400'
                  : lookupProblem
                    ? 'text-xs font-medium text-amber-400'
                    : 'text-xs font-medium text-white/40'
              }
            >
              {catalogLookup.message}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Material SAP
              </Label>
              <Input
                readOnly
                tabIndex={-1}
                className="h-12 rounded-xl border-white/10 bg-white/[0.03] text-white/70 font-bold"
                value={form.material}
                placeholder="Se obtiene del catálogo"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Categoría
              </Label>
              <Input
                readOnly
                tabIndex={-1}
                className="h-12 rounded-xl border-white/10 bg-white/[0.03] text-white/70 font-bold"
                value={form.category}
                placeholder="Automática"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              Nombre oficial del catálogo
            </Label>
            <Input
              readOnly
              tabIndex={-1}
              className="h-12 rounded-xl border-white/10 bg-white/[0.03] text-white/70 font-bold"
              value={form.name}
              placeholder="Se completará al validar el SKU"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Vigencia (días)
              </Label>
              <Input
                readOnly
                tabIndex={-1}
                className="h-12 rounded-xl border-white/10 bg-white/[0.03] text-white/70 font-bold"
                value={form.replacementDays}
                placeholder="Automática"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Unidad
              </Label>
              <Input
                readOnly
                tabIndex={-1}
                className="h-12 rounded-xl border-white/10 bg-white/[0.03] text-white/70 font-bold"
                value={form.unit}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Stock inicial
              </Label>
              <Input
                required
                type="number"
                min="0"
                max="1000000"
                step="1"
                inputMode="numeric"
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]"
                value={form.stock}
                onChange={(event) => setForm({ ...form, stock: event.target.value })}
                placeholder="Cajas o piezas según la regla"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Stock mínimo
              </Label>
              <Input
                type="number"
                min="0"
                max="1000000"
                step="1"
                inputMode="numeric"
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]"
                value={form.minStock}
                onChange={(event) => setForm({ ...form, minStock: event.target.value })}
                placeholder="Sugerido por catálogo"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Ubicación obligatoria
              </Label>
              <Input
                required
                maxLength={40}
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]"
                value={form.location}
                onChange={(event) => setForm({
                  ...form,
                  location: event.target.value.toUpperCase(),
                })}
                placeholder="Ej: A1-RACK-03"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Precio variable
              </Label>
              <Input
                type="number"
                min="0"
                max="100000000"
                step="0.01"
                inputMode="decimal"
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]"
                value={form.unitCost}
                onChange={(event) => setForm({ ...form, unitCost: event.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="submit"
              disabled={
                saving ||
                !lookupReady ||
                form.stock === '' ||
                form.location.trim() === ''
              }
              className="w-full h-14 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest transition-all disabled:bg-white/10 disabled:text-white/30"
            >
              {saving ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                'Confirmar registro validado'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
