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
import { collection, query, getDocs, doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "@/lib/firestore-error";
import { toast } from "sonner";
import { addDays } from "date-fns";

export function AssignPpeDialog() {
  const { user } = useAuth();
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
        toast.error("Atención: No hay stock disponible para este item.");
      }

      const assignmentId = doc(collection(db, 'assignments')).id;
      
      await setDoc(doc(db, 'assignments', assignmentId), {
        employeeId: selectedEmployee,
        sku: selectedItem,
        assignedAt: serverTimestamp(),
        // Client-side date generation as fallback, but ideally should be calculated on Cloud Function.
        nextReplacementAt: addDays(new Date(), itemRecord.replacementDays),
        status: 'active',
        issuedByUserId: user.uid
      });

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
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 rounded-xl transition-all border border-gray-200 text-left cursor-pointer text-gray-700 font-medium group"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
            <ArrowRight className="h-4 w-4 text-blue-600" />
          </div>
          <span className="text-sm">Registrar Nueva Entrega</span>
        </div>
        <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
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
