"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { collection, query, getDocs, doc, setDoc, serverTimestamp, getDoc, increment, updateDoc } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "@/lib/firestore-error";
import { toast } from "sonner";
import { addDays } from "date-fns";

export function AssignPpeDialog() {
  const { user: authUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Minimal data state for dropdowns
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
    if (!selectedEmployee || !selectedItem || !user) return;

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
      
      // Batch-like operations (though separate calls for simplicity here)
      await Promise.all([
        setDoc(doc(db, 'assignments', assignmentId), {
          employeeId: selectedEmployee,
          sku: selectedItem,
          assignedAt: serverTimestamp(),
          nextReplacementAt: addDays(new Date(), itemRecord.replacementDays),
          status: 'active',
          issuedByUserId: authUser.uid
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
        className="w-full flex items-center justify-between p-5 bg-gradient-to-r from-indigo-50 to-white hover:from-indigo-100 hover:to-indigo-50 rounded-2xl transition-all border border-indigo-100 shadow-sm hover:shadow-md text-left cursor-pointer group"
      >
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform">
            <ArrowRight className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-none">Registrar Nueva Entrega</p>
            <p className="text-xs text-gray-500 mt-1">Asignar material a un colaborador</p>
          </div>
        </div>
        <div className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-gray-100 group-hover:border-indigo-200 transition-colors">
          <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
        </div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Asignar Nuevo EPP</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label>Empleado</Label>
            <Select value={selectedEmployee} onValueChange={v => setSelectedEmployee(v ?? '')} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un empleado" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
                {employees.length === 0 && <SelectItem value="placeholder-emp" disabled>No hay empleados cargados</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Equipo (SKU)</Label>
            <Select value={selectedItem} onValueChange={v => setSelectedItem(v ?? '')} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un modelo/equipo" />
              </SelectTrigger>
              <SelectContent>
                {items.map(it => (
                  <SelectItem key={it.id} value={it.id}>{it.name} (Stock: {it.stock})</SelectItem>
                ))}
                {items.length === 0 && <SelectItem value="placeholder-item" disabled>No hay items en el catálogo</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full" disabled={loading || !selectedEmployee || !selectedItem}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Entrega
          </Button>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
