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
import { Loader2 } from 'lucide-react';
import { type PpeItem } from '../_hooks/useInventoryData';

export interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adjustItem: PpeItem | null;
  adjustQty: string;
  setAdjustQty: (v: string) => void;
  adjustType: 'add' | 'subtract' | 'set';
  setAdjustType: (v: 'add' | 'subtract' | 'set') => void;
  adjustSize: string;
  setAdjustSize: (v: string) => void;
  adjustSaving: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  adjustItem,
  adjustQty,
  setAdjustQty,
  adjustType,
  setAdjustType,
  adjustSize,
  setAdjustSize,
  adjustSaving,
  onSubmit,
}: AdjustStockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] rounded-[2rem] border border-white/10 p-0 overflow-hidden bg-[#040813]">
        <div className="bg-[#F40009] p-8 text-white">
           <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">Ajuste de Existencias</DialogTitle>
              <p className="text-white/80 font-medium mt-1">{adjustItem?.name}</p>
           </DialogHeader>
        </div>
        <form onSubmit={onSubmit} className="p-8 space-y-6">
          {adjustItem?.hasSizes && adjustItem.sizes && (
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Talla / Variante</Label>
              <Select value={adjustSize} onValueChange={v => setAdjustSize(v || '')}>
                <SelectTrigger className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-medium">
                  <SelectValue placeholder="Seleccionar talla..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0A1628] border-white/10 text-white rounded-xl">
                  {Object.entries(adjustItem.sizes).map(([size, variant]) => (
                    <SelectItem key={size} value={size}>
                      {size} · Stock {variant.stock ?? 0} · {variant.sku}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex bg-white/5 p-1.5 rounded-xl border border-white/10">
             <Button type="button" variant="ghost" onClick={() => setAdjustType('add')} className={`flex-1 h-10 rounded-lg font-bold text-[10px] tracking-widest ${adjustType === 'add' ? 'bg-white/15 text-white' : 'text-white/40'}`}>+ AÑADIR</Button>
             <Button type="button" variant="ghost" onClick={() => setAdjustType('subtract')} className={`flex-1 h-10 rounded-lg font-bold text-[10px] tracking-widest ${adjustType === 'subtract' ? 'bg-white/15 text-white' : 'text-white/40'}`}>- QUITAR</Button>
             <Button type="button" variant="ghost" onClick={() => setAdjustType('set')} className={`flex-1 h-10 rounded-lg font-bold text-[10px] tracking-widest ${adjustType === 'set' ? 'bg-white/15 text-white' : 'text-white/40'}`}>= SET</Button>
          </div>
          
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Cantidad a procesar</Label>
            <Input 
              type="number" 
              className="h-20 text-center text-4xl font-black rounded-2xl bg-white/5 border-white/10 text-white focus-visible:ring-[#F40009]" 
              value={adjustQty} 
              onChange={e => setAdjustQty(e.target.value)}
              autoFocus
            />
          </div>
          
          <DialogFooter>
             <Button type="submit" disabled={adjustSaving} className="w-full h-14 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest transition-all">
               {adjustSaving ? <Loader2 className="h-6 w-6 animate-spin" /> : "Aplicar Movimiento"}
             </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
