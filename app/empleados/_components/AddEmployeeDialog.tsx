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
import { UserPlus, Loader2 } from 'lucide-react';
import { EMPLOYEE_COST_CENTERS } from '@/lib/employee-cost-centers';
import { AREAS, type EmployeeForm } from '../_hooks/useEmployeeData';

export interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: EmployeeForm;
  setForm: React.Dispatch<React.SetStateAction<EmployeeForm>>;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function AddEmployeeDialog({
  open,
  onOpenChange,
  form,
  setForm,
  saving,
  onSubmit,
}: AddEmployeeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-[2rem] border border-white/10 p-0 overflow-hidden shadow-2xl bg-[#040813]">
        <div className="bg-white/5 p-8 relative border-b border-white/10">
           <div className="absolute top-0 right-0 p-8 opacity-10">
              <UserPlus className="h-20 w-20 text-white" />
           </div>
           <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight text-white uppercase">Registro de Nómina</DialogTitle>
              <p className="text-white/50 font-medium mt-1">Añadir nuevo colaborador al sistema central de activos.</p>
           </DialogHeader>
        </div>
        <form onSubmit={onSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Nº de Nómina / ID</Label>
              <Input
                placeholder="Ej: 1881"
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-medium focus-visible:ring-[#F40009]"
                value={form.id}
                onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Unidad de Negocio</Label>
              <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v ?? '' }))}>
                <SelectTrigger className="h-12 rounded-xl bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Área..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0A1628] border-white/10 text-white rounded-xl">
                  {AREAS.map(a => <SelectItem key={a} value={a}>{a.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Nombre Completo</Label>
            <Input
              placeholder="Nombre y Apellidos"
              className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-medium focus-visible:ring-[#F40009]"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Centro de costos</Label>
            <Select
              value={form.costCenter}
              onValueChange={value => setForm(current => ({ ...current, costCenter: value ?? '' }))}
            >
              <SelectTrigger className="h-12 rounded-xl bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Selecciona el centro de costos..." />
              </SelectTrigger>
              <SelectContent className="bg-[#0A1628] border-white/10 text-white rounded-xl">
                {EMPLOYEE_COST_CENTERS.map(costCenter => (
                  <SelectItem key={costCenter} value={costCenter}>{costCenter}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-4">
            <Button
              type="submit"
              disabled={saving || !form.id || !form.name || !form.area || !form.costCenter}
              className="w-full h-14 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest transition-all"
            >
              {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : "Vincular a la Red ORSTED CORP"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
