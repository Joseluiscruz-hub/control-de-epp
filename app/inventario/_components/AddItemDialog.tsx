"use client";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { PackagePlus, Loader2 } from 'lucide-react';
import { CATEGORIES } from '../_hooks/useInventoryData';

export interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  form: {
    sku: string;
    name: string;
    category: string;
    replacementDays: string;
    stock: string;
  };
  setForm: (form: AddItemDialogProps['form']) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AddItemDialog({
  open,
  onOpenChange,
  saving,
  form,
  setForm,
  onSubmit,
}: AddItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-[2rem] border border-white/10 p-0 overflow-hidden bg-[#040813]">
        <div className="bg-white/5 p-8 relative border-b border-white/10">
           <div className="absolute top-0 right-0 p-8 opacity-10">
              <PackagePlus className="h-20 w-20 text-white" />
           </div>
           <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight uppercase text-white">Alta de Material</DialogTitle>
              <p className="text-white/50 font-medium mt-1">Registrar nueva especificación en el catálogo corporativo.</p>
           </DialogHeader>
        </div>
        <form onSubmit={onSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Código SKU</Label>
              <Input 
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]" 
                value={form.sku} 
                onChange={e => setForm({...form, sku: e.target.value.toUpperCase()})}
                placeholder="Ej: CAS-001"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Categoría</Label>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v || ''})}>
                <SelectTrigger className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-medium">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0A1628] border-white/10 text-white rounded-xl">
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Nombre Descriptivo</Label>
            <Input 
              className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]" 
              value={form.name} 
              onChange={e => setForm({...form, name: e.target.value})}
              placeholder="Ej: Casco Pro-Vent Red"
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Vida Útil (Días)</Label>
              <Input 
                type="number" 
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]" 
                value={form.replacementDays} 
                onChange={e => setForm({...form, replacementDays: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Stock Inicial</Label>
              <Input 
                type="number" 
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]" 
                value={form.stock} 
                onChange={e => setForm({...form, stock: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="submit" disabled={saving} className="w-full h-14 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest transition-all">
              {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : "Confirmar Registro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
