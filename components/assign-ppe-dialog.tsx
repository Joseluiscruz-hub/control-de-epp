"use client";

import { useCallback, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, HardHat, UserCheck, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { collection, query, where, getDocs, doc, serverTimestamp, runTransaction, Timestamp } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "@/lib/firestore-error";
import { toast } from "sonner";
import { addDays } from "date-fns";
import { motion } from "motion/react";
import { createLocalAssignment, listLocalEmployees, listLocalInventory } from "@/lib/kiosk-local-store";
import { resolveEppReplacementDays } from "@/lib/epp-duration-rules";
import { normalizePlantId } from "@/lib/plants";
import { usePlantStore } from "@/store/usePlantStore";

type EmployeeOption = { id: string; name: string; area?: string; plantaId?: string };
type ItemOption = { id: string; name: string; stock: number; replacementDays: number; plantaId?: string };

export function AssignPpeDialog() {
  const { user: authUser } = useAuth();
  const { activePlantId } = usePlantStore();
  const writePlantId = normalizePlantId(activePlantId);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedItem, setSelectedItem] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const empSnap = await getDocs(activePlantId === 'todas'
        ? query(collection(db, 'employees'))
        : query(collection(db, 'employees'), where('plantaId', '==', activePlantId))
      );
      setEmployees(empSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name,
        area: d.data().area,
        plantaId: d.data().plantaId,
      })));

      const itemSnap = await getDocs(activePlantId === 'todas'
        ? query(collection(db, 'ppe_catalog'))
        : query(collection(db, 'ppe_catalog'), where('plantaId', '==', activePlantId))
      );
      setItems(itemSnap.docs.map(d => {
        const data = d.data();
        return {
        id: d.id, 
        name: data.name,
        stock: Number(data.stock ?? 0),
        replacementDays: resolveEppReplacementDays(
          {
            sku: data.sku ?? d.id,
            material: data.material,
            name: data.name,
            sizes: data.sizes,
          },
          Number(data.replacementDays ?? 365)
        )
        ,
        plantaId: data.plantaId,
      };
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'employees/ppe_catalog');
      setEmployees(listLocalEmployees().map((employee) => ({ id: employee.id, name: employee.name })));
      setItems(listLocalInventory().map((item) => ({
        id: item.docId,
        name: item.name,
        stock: Number(item.stock ?? 0),
        replacementDays: Number(item.replacementDays ?? 365),
      })));
    }
  }, [activePlantId]);

  useEffect(() => {
    if (!open) return;

    void (async () => {
      await fetchData();
    })();
  }, [fetchData, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !selectedItem || !authUser) return;

    setLoading(true);
    try {
      const itemRecord = items.find(i => i.id === selectedItem);
      const employeeRecord = employees.find(employee => employee.id === selectedEmployee);
      if (!itemRecord) throw new Error("Item no encontrado");

      if (itemRecord.stock <= 0) {
        toast.error("No hay stock disponible para este artículo.");
        setLoading(false);
        return;
      }

      const assignmentId = doc(collection(db, 'assignments')).id;

      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'ppe_catalog', selectedItem);
        const kioskItemRef = doc(db, 'kiosk_catalog', selectedItem);
        const [itemSnap, kioskItemSnap] = await Promise.all([
          transaction.get(itemRef),
          transaction.get(kioskItemRef),
        ]);

        if (!itemSnap.exists()) {
          throw new Error('item_not_found');
        }

        const itemData = itemSnap.data();
        const stock = Number(itemData.stock ?? 0);
        if (!Number.isFinite(stock) || stock <= 0) {
          throw new Error('out_of_stock');
        }

        const nextStock = stock - 1;
        const assignmentSku = typeof itemData.sku === 'string' && itemData.sku ? itemData.sku : selectedItem;
        const replacementDays = resolveEppReplacementDays(
          {
            sku: assignmentSku,
            material: itemData.material,
            name: itemData.name,
            sizes: itemData.sizes,
          },
          Number(itemData.replacementDays ?? itemRecord.replacementDays ?? 365)
        );

        transaction.set(doc(db, 'assignments', assignmentId), {
          employeeId: selectedEmployee,
          employeeName: employeeRecord?.name ?? '',
          employeeArea: employeeRecord?.area ?? '',
          plantaId: normalizePlantId(employeeRecord?.plantaId ?? itemData.plantaId ?? writePlantId),
          sku: assignmentSku,
          itemId: selectedItem,
          itemName: itemData.name ?? itemRecord.name,
          replacementDays,
          size: 'N/A',
          assignedAt: serverTimestamp(),
          nextReplacementAt: Timestamp.fromDate(addDays(new Date(), replacementDays)),
          status: 'active',
          issuedByUserId: authUser?.uid || 'unknown'
        });

        transaction.update(itemRef, {
          stock: nextStock,
          plantaId: normalizePlantId(itemData.plantaId ?? writePlantId),
          updatedAt: serverTimestamp()
        });

        if (kioskItemSnap.exists()) {
          transaction.update(kioskItemRef, {
            stock: nextStock,
            available: nextStock > 0,
            plantaId: normalizePlantId(itemData.plantaId ?? writePlantId),
            updatedAt: serverTimestamp()
          });
        }
      });

      toast.success("EPP Asignado exitosamente");
      setOpen(false);
      setSelectedEmployee("");
      setSelectedItem("");
    } catch (err) {
      try {
        const itemRecord = items.find(i => i.id === selectedItem);
        if (!itemRecord) throw err;
        createLocalAssignment({
          employeeId: selectedEmployee,
          sku: selectedItem,
          size: 'N/A',
          itemId: selectedItem,
          replacementDays: itemRecord.replacementDays,
          issuedByUserId: authUser?.uid || 'offline-admin',
        });
        toast.success("EPP asignado localmente");
        setOpen(false);
        setSelectedEmployee("");
        setSelectedItem("");
      } catch {
        if (err instanceof Error && err.message === 'out_of_stock') {
          toast.error("No hay stock disponible para este artículo.");
        } else {
          toast.error("Hubo un error al registrar la entrega.");
        }
        handleFirestoreError(err, OperationType.CREATE, 'assignments');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="surface-action w-full flex items-center justify-between p-4 group text-left"
      >
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-lg bg-[#F40009] flex items-center justify-center shadow-lg shadow-red-950/20 group-hover:scale-105 transition-transform">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-black text-white leading-tight uppercase tracking-wide">Nueva Dotación</p>
            <p className="section-eyebrow mt-1">Asignar material a nómina</p>
          </div>
        </div>
        <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/5 group-hover:bg-[#F40009] transition-colors">
          <ArrowRight className="h-4 w-4 text-white/35 group-hover:text-white transition-colors" />
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-xl border border-white/10 p-0 overflow-hidden shadow-2xl bg-[#07090d]">
          <div className="bg-white/[0.055] p-7 text-white relative border-b border-white/10">
             <div className="absolute top-0 right-0 p-8 opacity-5">
                <HardHat className="h-20 w-20" />
             </div>
             <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tight">Registro de Entrega</DialogTitle>
                <p className="text-white/50 font-bold mt-1">Vincular EPP a un colaborador en planta.</p>
             </DialogHeader>
          </div>
          
          <form onSubmit={handleSubmit} className="p-7 space-y-6">
            <div className="space-y-4">
              <Label className="section-eyebrow ml-1">Seleccionar Colaborador</Label>
              <Select value={selectedEmployee} onValueChange={v => setSelectedEmployee(v || '')} disabled={loading}>
                <SelectTrigger className="h-14 rounded-lg bg-white/5 border-white/10 font-bold text-white px-5">
                  <div className="flex items-center gap-3">
                    <UserCheck className="h-5 w-5 text-red-600" />
                    <SelectValue placeholder="Buscar por nombre..." />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-lg border-white/10 bg-[#10151d] text-white shadow-2xl">
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id} className="font-bold py-3 px-4">{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label className="section-eyebrow ml-1">Especificación de Equipo (SKU)</Label>
              <Select value={selectedItem} onValueChange={v => setSelectedItem(v || '')} disabled={loading}>
                <SelectTrigger className="h-14 rounded-lg bg-white/5 border-white/10 font-bold text-white px-5">
                  <div className="flex items-center gap-3">
                    <HardHat className="h-5 w-5 text-red-600" />
                    <SelectValue placeholder="Seleccionar material..." />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-lg border-white/10 bg-[#10151d] text-white shadow-2xl">
                  {items.map(it => (
                    <SelectItem key={it.id} value={it.id} className="font-bold py-3 px-4">
                       <div className="flex justify-between items-center w-full gap-10">
                          <span>{it.name}</span>
                          <Badge className="rounded-md bg-white/10 text-white/60 border-none font-black text-[9px]">STOCK: {it.stock}</Badge>
                       </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              type="submit" 
              className="w-full h-14 rounded-lg bg-[#F40009] hover:bg-red-700 text-white font-black uppercase tracking-widest shadow-xl transition-all text-sm active:scale-95"
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
