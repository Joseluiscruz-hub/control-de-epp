"use client";

import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, doc, setDoc, updateDoc,
  serverTimestamp, query, increment
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Package, PackagePlus, Search, AlertTriangle, TrendingDown,
  Loader2, PackageCheck, Plus, Minus, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

interface PpeItem {
  docId: string;
  sku: string;
  name: string;
  category: string;
  replacementDays: number;
  stock: number;
  createdAt?: Date;
}

const CATEGORIES = [
  'Guantes', 'Cascos', 'Botas de Seguridad', 'Lentes / Gafas',
  'Protección Auditiva', 'Respiradores / Mascarillas', 'Ropa de Trabajo',
  'Arneses / Protección en Alturas', 'Calzado Especial', 'Otros'
];

const LOW_STOCK_THRESHOLD = 20;

export default function InventarioPage() {
  const [items, setItems] = useState<PpeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // Add item dialog
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sku: '', name: '', category: '', replacementDays: '', stock: ''
  });

  // Stock adjust dialog
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<PpeItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustSaving, setAdjustSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'ppe_catalog'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({
        docId: d.id,
        sku: d.data().sku,
        name: d.data().name,
        category: d.data().category,
        replacementDays: d.data().replacementDays,
        stock: d.data().stock,
        createdAt: d.data().createdAt?.toDate(),
      }));
      setItems(data);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku || !form.name || !form.category || !form.replacementDays || !form.stock) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'ppe_catalog', form.sku), {
        sku: form.sku,
        name: form.name,
        category: form.category,
        replacementDays: parseInt(form.replacementDays),
        stock: parseInt(form.stock),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success(`Artículo "${form.name}" agregado al catálogo`);
      setForm({ sku: '', name: '', category: '', replacementDays: '', stock: '' });
      setAddOpen(false);
    } catch {
      toast.error('Error al registrar el artículo');
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem || !adjustQty) return;
    const qty = parseInt(adjustQty);
    if (isNaN(qty) || qty < 0) return;
    setAdjustSaving(true);
    try {
      let newStock: number | ReturnType<typeof increment>;
      if (adjustType === 'add') {
        newStock = increment(qty);
      } else if (adjustType === 'subtract') {
        newStock = increment(-qty);
      } else {
        newStock = qty;
      }
      await updateDoc(doc(db, 'ppe_catalog', adjustItem.docId), {
        stock: newStock,
        updatedAt: serverTimestamp(),
      });
      const label = adjustType === 'add' ? `+${qty}` : adjustType === 'subtract' ? `-${qty}` : `= ${qty}`;
      toast.success(`Stock de "${adjustItem.name}" actualizado (${label})`);
      setAdjustOpen(false);
      setAdjustQty('');
    } catch {
      toast.error('Error al ajustar el stock');
    } finally {
      setAdjustSaving(false);
    }
  };

  const openAdjust = (item: PpeItem) => {
    setAdjustItem(item);
    setAdjustQty('');
    setAdjustType('add');
    setAdjustOpen(true);
  };

  const filtered = items.filter(it => {
    const matchSearch = it.name.toLowerCase().includes(search.toLowerCase()) ||
      it.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || it.category === filterCategory;
    return matchSearch && matchCat;
  });

  const totalStock = items.reduce((sum, i) => sum + i.stock, 0);
  const lowStockItems = items.filter(i => i.stock <= LOW_STOCK_THRESHOLD && i.stock > 0);
  const outOfStock = items.filter(i => i.stock === 0);

  const stockColor = (stock: number) => {
    if (stock === 0) return 'text-red-700 bg-red-50 border-red-200';
    if (stock <= LOW_STOCK_THRESHOLD) return 'text-orange-700 bg-orange-50 border-orange-200';
    return 'text-green-700 bg-green-50 border-green-200';
  };

  const uniqueCategories = Array.from(new Set(items.map(i => i.category)));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Gestión de Inventario</h1>
          <p className="text-gray-500 mt-1">Catálogo de EPP, stock y tiempos de vida útil.</p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
        >
          <PackagePlus className="h-4 w-4" />
          Nuevo Artículo
        </Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-indigo-600" />
              Registrar Artículo de EPP
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU / Código *</Label>
                <Input id="sku" placeholder="Ej: G-01"
                  value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-init">Stock Inicial *</Label>
                <Input id="stock-init" type="number" min="0" placeholder="0"
                  value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-name">Nombre / Descripción *</Label>
              <Input
                id="item-name"
                placeholder="Ej: Guantes de Carnaza"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-cat">Categoría *</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v ?? '' }))}>
                <SelectTrigger id="item-cat" className="w-full">
                  <SelectValue placeholder="Selecciona categoría" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repl-days">Días de Vida Útil *</Label>
              <Input id="repl-days" type="number" min="1" placeholder="Ej: 45"
                value={form.replacementDays}
                onChange={e => setForm(f => ({ ...f, replacementDays: e.target.value }))} required />
              <p className="text-xs text-gray-400">Cada cuántos días se debe reemplazar este equipo.</p>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-indigo-600" />
              Ajustar Stock
            </DialogTitle>
          </DialogHeader>
          {adjustItem && (
            <form onSubmit={handleAdjust} className="space-y-5 pt-2">
              <div className="rounded-lg bg-gray-50 border p-3.5">
                <p className="font-semibold text-gray-900">{adjustItem.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">SKU: {adjustItem.sku}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-gray-500">Stock actual:</span>
                  <span className={`font-bold text-sm px-2 py-0.5 rounded border ${stockColor(adjustItem.stock)}`}>
                    {adjustItem.stock}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Ajuste</Label>
                <div className="flex gap-2">
                  {([
                    { type: 'add', label: 'Entrada', icon: <Plus className="h-3.5 w-3.5" /> },
                    { type: 'subtract', label: 'Salida', icon: <Minus className="h-3.5 w-3.5" /> },
                    { type: 'set', label: 'Fijar', icon: <RefreshCw className="h-3.5 w-3.5" /> },
                  ] as const).map(opt => (
                    <button
                      type="button"
                      key={opt.type}
                      onClick={() => setAdjustType(opt.type)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${adjustType === opt.type
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                        : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'}`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-qty">
                  {adjustType === 'add' ? 'Cantidad a Sumar' :
                    adjustType === 'subtract' ? 'Cantidad a Restar' :
                      'Nuevo Stock Total'}
                </Label>
                <Input
                  id="adj-qty"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={adjustQty}
                  onChange={e => setAdjustQty(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={adjustSaving || !adjustQty} className="bg-indigo-600 hover:bg-indigo-700">
                  {adjustSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Aplicar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
