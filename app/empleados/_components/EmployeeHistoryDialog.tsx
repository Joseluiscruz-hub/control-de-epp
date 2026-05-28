"use client";

import {
  Dialog, DialogContent, DialogTitle
} from '@/components/ui/dialog';
import { Loader2, ShieldCheck, HardHat, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion } from 'motion/react';
import type { Employee, Assignment } from '../_hooks/useEmployeeData';

export interface EmployeeHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEmployee: Employee | null;
  history: Assignment[];
  historyLoading: boolean;
}

export function EmployeeHistoryDialog({
  open,
  onOpenChange,
  selectedEmployee,
  history,
  historyLoading,
}: EmployeeHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl rounded-[2rem] border border-white/10 p-0 overflow-hidden shadow-2xl bg-[#040813]">
        <div className="bg-[#F40009] p-8 text-white flex items-center justify-between">
          <div>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Expediente de Seguridad</DialogTitle>
            <div className="flex items-center gap-3 mt-2">
               <p className="text-white font-bold opacity-90">{selectedEmployee?.name}</p>
               <span className="px-2 py-1 bg-white/20 rounded font-black text-[9px] tracking-widest">NÓMINA #{selectedEmployee?.id}</span>
            </div>
          </div>
          <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center">
             <ShieldCheck className="h-8 w-8 text-white" />
          </div>
        </div>
        <div className="p-8 max-h-[600px] overflow-y-auto">
          {historyLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-[#F40009]" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-white/10 bg-white/5">
              <Activity className="h-12 w-12 mx-auto mb-4 text-white/20" />
              <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Sin registros de dotación</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {history.map(h => (
                <motion.div 
                  key={h.id} 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/10"
                >
                  <div className="flex items-center gap-4">
                     <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                       h.status === 'active' ? 'bg-[#F40009]/20 text-[#F40009]' : 'bg-white/10 text-white/40'
                     }`}>
                        <HardHat className="h-6 w-6" />
                     </div>
                     <div>
                        <p className="font-bold text-white text-base uppercase">{h.sku}</p>
                        <p className="text-[10px] text-white/50 font-bold tracking-widest uppercase mt-0.5">
                          DOTACIÓN: {format(h.assignedAt, 'dd MMM, yyyy', { locale: es })}
                        </p>
                     </div>
                  </div>
                  <div className="text-right">
                     <span className={`inline-block font-bold text-[9px] tracking-widest px-3 py-1 rounded-lg ${
                       h.status === 'active' ? 'bg-[#F40009] text-white' : 'bg-white/10 text-white/40'
                     }`}>
                        {h.status === 'active' ? 'EN OPERACIÓN' : 'HISTÓRICO'}
                     </span>
                     {h.nextReplacementAt && h.status === 'active' && (
                       <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mt-1.5 animate-pulse">
                         Cambio: {format(h.nextReplacementAt, 'dd/MM/yyyy')}
                       </p>
                     )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
