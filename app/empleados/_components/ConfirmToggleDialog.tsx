"use client";

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import type { Employee } from '../_hooks/useEmployeeData';

export interface ConfirmToggleDialogProps {
  employee: Employee | null;
  onClose: () => void;
  onConfirm: (emp: Employee) => void;
}

export function ConfirmToggleDialog({
  employee,
  onClose,
  onConfirm,
}: ConfirmToggleDialogProps) {
  return (
    <Dialog open={!!employee} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[450px] rounded-[2rem] border border-white/10 p-0 overflow-hidden bg-[#040813]">
        <div className={`p-8 text-white ${employee?.active ? 'bg-[#F40009]' : 'bg-emerald-600'}`}>
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">
              {employee?.active ? '¿Dar de Baja?' : '¿Reactivar Colaborador?'}
            </DialogTitle>
            <p className="text-white/80 font-medium mt-1 text-sm">
              {employee?.name} — Nómina #{employee?.id}
            </p>
          </DialogHeader>
        </div>
        <div className="p-8 space-y-6">
          <p className="text-white/70 font-medium text-sm">
            {employee?.active
              ? 'El colaborador será marcado como inactivo. Su historial de EPP se conservará intacto.'
              : 'El colaborador será reactivado y podrá recibir dotación de EPP.'}
          </p>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] text-white/50 hover:text-white hover:bg-white/10"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              className={`flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] text-white ${
                employee?.active 
                  ? 'bg-[#F40009] hover:bg-red-700' 
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
              onClick={() => employee && onConfirm(employee)}
            >
              {employee?.active ? 'Confirmar Baja' : 'Confirmar Reactivación'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
