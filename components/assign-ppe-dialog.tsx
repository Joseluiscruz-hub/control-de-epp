"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, HardHat, UserCheck, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { collection, query, getDocs, doc, setDoc, serverTimestamp, increment, updateDoc } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "@/lib/firestore-error";
import { toast } from "sonner";
import { addDays } from "date-fns";
import { motion } from "motion/react";

export function AssignPpeDialog() {
  const { user: authUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [items, setItems] = useState<{id: string, name: string, stock: number, replacementDays: number}[]>([]);

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedItem, setSelectedItem] = useState("");

  const fetchData = async () => {
    try {
      const empSnap = await getDocs(query(collection(db, 'employees')));
      setEmployees(empSnap.docs.map(d => ({ id: d.id, name: d.data().name })));

      const itemSnap = await getDocs(query(collection(db, 'ppe_catalog')));
      setItems(itemSnap.docs.map(d => ({ 
        id: d.id, 
        name: d.data().name, 
        stock: d.data().stock,
        replacementDays: d.data().replacementDays
      })));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'employees/ppe_catalog');
    }
  };

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !selectedItem || !authUser) return;

    setLoading(true);
    try {
      const itemRecord = items.find(i => i.id === selectedItem);
      if (!itemRecord) throw new Error("Item no encontrado");

      if (itemRecord.stock <= 0) {
        toast.error("No hay stock disponible para este artículo.");
        setLoading(false);
        return;
      }

      const assignmentId = doc(collection(db, 'assignments')).id;
      
      await Promise.all([
        setDoc(doc(db, 'assignments', assignmentId), {
          employeeId: selectedEmployee,
          sku: selectedItem,
          assignedAt: serverTimestamp(),
          nextReplacementAt: addDays(new Date(), itemRecord.replacementDays),
          status: 'active',
          issuedByUserId: authUser?.uid || 'unknown'
        }),
        updateDoc(doc(db, 'ppe_catalog', selectedItem), {
          stock: increment(-1),
          updatedAt: serverTimestamp()
        })
      ]);

      toast.success("EPP Asignado exitosamente");
      setOpen(false);
      setSelectedEmployee("");
      setSelectedItem("");
    } catch (err) {
      toast.error("Hubo un error al registrar la entrega.");
      handleFirestoreError(err, OperationType.CREATE, 'assignments');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between p-6 bg-white hover:bg-red-50 rounded-[1.5rem] transition-all border border-slate-100 shadow-xl shadow-red-100/20 group text-left"
      >
        <div className="flex items-center gap-5">
          <div className="h-14 w-14 rounded-2xl bg-[#F40009] flex items-center justify-center shadow-xl shadow-red-200 group-hover:scale-110 transition-transform">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-950 leading-tight uppercase tracking-tighter">Nueva Dotación</p>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Asignar material a nómina</p>
          </div>
        </div>
        <div className="h-10 w-10 rounded-full flex items-center justify-center bg-slate-50 group-hover:bg-[#F40009] transition-colors">
          <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-white transition-colors" />
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[3rem] border-none p-0 overflow-hidden shadow-2xl">
          <div className="bg-slate-950 p-10 text-white relative">
             <div className="absolute top-0 right-0 p-8 opacity-10">
                <HardHat className="h-20 w-20" />
             </div>
             <DialogHeader>
                <DialogTitle className="text-3xl font-black uppercase tracking-tight">Registro de Entrega</DialogTitle>
                <p className="text-slate-400 font-bold mt-1">Vincular EPP a un colaborador en planta.</p>
             </DialogHeader>
          </div>
          
          <form onSubmit={handleSubmit} className="p-10 space-y-8 bg-white">
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Seleccionar Colaborador</Label>
              <Select value={selectedEmployee} onValueChange={v => setSelectedEmployee(v || '')} disabled={loading}>
                <SelectTrigger className="h-16 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-lg px-6">
                  <div className="flex items-center gap-3">
                    <UserCheck className="h-5 w-5 text-red-600" />
                    <SelectValue placeholder="Buscar por nombre..." />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl">
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id} className="font-bold py-3 px-4">{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Especificación de Equipo (SKU)</Label>
              <Select value={selectedItem} onValueChange={v => setSelectedItem(v || '')} disabled={loading}>
                <SelectTrigger className="h-16 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-lg px-6">
                  <div className="flex items-center gap-3">
                    <HardHat className="h-5 w-5 text-red-600" />
                    <SelectValue placeholder="Seleccionar material..." />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl">
                  {items.map(it => (
                    <SelectItem key={it.id} value={it.id} className="font-bold py-3 px-4">
                       <div className="flex justify-between items-center w-full gap-10">
                          <span>{it.name}</span>
                          <Badge className="bg-slate-100 text-slate-500 border-none font-black text-[9px]">STOCK: {it.stock}</Badge>
                       </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              type="submit" 
              className="w-full h-20 rounded-[1.5rem] bg-[#F40009] hover:bg-slate-950 text-white font-black uppercase tracking-widest shadow-2xl transition-all text-sm active:scale-95" 
              disabled={loading || !selectedEmployee || !selectedItem}
            >
              {loading ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : "Confirmar Dotación Técnica"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
