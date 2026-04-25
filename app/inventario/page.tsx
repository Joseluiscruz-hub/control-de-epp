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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">SKUs Totales</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{items.length}</p>
              </div>
              <Package className="h-8 w-8 text-indigo-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Unidades en Stock</p>
                <p className="text-3xl font-bold text-blue-700 mt-1">{totalStock.toLocaleString()}</p>
              </div>
              <PackageCheck className="h-8 w-8 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${lowStockItems.length > 0 ? 'border-l-orange-400' : 'border-l-gray-200'}`}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Stock Bajo</p>
                <p className={`text-3xl font-bold mt-1 ${lowStockItems.length > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  {lowStockItems.length}
                </p>
              </div>
              <AlertTriangle className={`h-8 w-8 ${lowStockItems.length > 0 ? 'text-orange-400' : 'text-gray-200'}`} />
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${outOfStock.length > 0 ? 'border-l-red-500' : 'border-l-gray-200'}`}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Sin Stock</p>
                <p className={`text-3xl font-bold mt-1 ${outOfStock.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {outOfStock.length}
                </p>
              </div>
              <TrendingDown className={`h-8 w-8 ${outOfStock.length > 0 ? 'text-red-400' : 'text-gray-200'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low stock alert banner */}
      {(lowStockItems.length > 0 || outOfStock.length > 0) && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-orange-800 text-sm">
              {outOfStock.length > 0
                ? `${outOfStock.length} artículo(s) sin stock y ${lowStockItems.length} con stock bajo`
                : `${lowStockItems.length} artículo(s) con stock bajo`}
            </p>
            <p className="text-orange-600 text-xs mt-0.5">
              {outOfStock.map(i => i.name).concat(lowStockItems.map(i => i.name)).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={v => setFilterCategory(v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Filtrar por categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {uniqueCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center p-16 text-gray-400">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No se encontraron artículos</p>
              <p className="text-sm mt-1">Agrega artículos al catálogo para comenzar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/60">
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">SKU</th>
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Artículo</th>
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Categoría</th>
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Vida Útil</th>
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Stock</th>
                    <th className="h-11 px-5 text-right font-semibold text-gray-500 text-xs uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.docId} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-bold text-indigo-600 text-xs">{item.sku}</td>
                      <td className="px-5 py-3.5 font-semibold text-gray-900">{item.name}</td>
                      <td className="px-5 py-3.5 text-gray-600">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        <span className="font-medium">{item.replacementDays}</span>
                        <span className="text-gray-400 ml-1">días</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold border ${stockColor(item.stock)}`}>
                          {item.stock === 0 && <AlertTriangle className="h-3.5 w-3.5 mr-1" />}
                          {item.stock}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end">
                          <Button
                            size="sm" variant="outline"
                            className="gap-1.5 text-xs h-8 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                            onClick={() => openAdjust(item)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Ajustar Stock
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
