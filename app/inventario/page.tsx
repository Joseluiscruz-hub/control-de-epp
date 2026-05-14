"use client";

import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, doc, setDoc, updateDoc,
  serverTimestamp, query, increment
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card } from '@/components/ui/card';
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
import { motion, AnimatePresence } from 'motion/react';

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
const BRAND_RED = "#F40009";

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
    return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  };

  const uniqueCategories = Array.from(new Set(items.map(i => i.category)));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-12 pb-20"
    >
      {/* Header - Industrial Premium */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-2xl shadow-red-100/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-full bg-red-600/5 -mr-20 -skew-x-12" />
        
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-3 mb-2">
             <Badge className="bg-red-600 text-white border-none px-4 py-1 rounded-full font-black text-[10px] uppercase tracking-widest">Master Catalog</Badge>
          </div>
          <h1 className="text-5xl lg:text-6xl font-black tracking-tighter text-slate-950">Inventario <span className="text-red-600">FEMSA</span></h1>
          <p className="text-slate-400 font-bold text-lg max-w-xl">Control de activos críticos y gestión de suministros de seguridad industrial.</p>
        </div>
        
        <div className="relative z-10">
          <Button
            onClick={() => setAddOpen(true)}
            className="h-20 px-10 rounded-[2rem] bg-slate-950 hover:bg-[#F40009] text-white shadow-2xl transition-all font-black uppercase tracking-widest text-xs gap-4 active:scale-95 group"
          >
            <PackagePlus className="h-6 w-6 group-hover:rotate-12 transition-transform" />
            Añadir Material
          </Button>
        </div>
      </div>

      {/* Corporate Mini Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="bg-slate-950 p-10 rounded-[3rem] border-none shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <Package className="h-20 w-20 text-white" />
          </div>
          <p className="text-[11px] font-black text-red-500 uppercase tracking-[0.3em] mb-3">Unidades Totales</p>
          <p className="text-6xl font-black text-white tracking-tighter">{totalStock.toLocaleString()}</p>
        </Card>
        
        <Card className="bg-white p-10 rounded-[3rem] border-none shadow-xl relative overflow-hidden group border border-slate-100">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <TrendingDown className="h-20 w-20 text-red-600" />
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">Stock Crítico</p>
          <p className="text-6xl font-black text-red-600 tracking-tighter">{lowStockItems.length}</p>
        </Card>

        <Card className="bg-white p-10 rounded-[3rem] border-none shadow-xl relative overflow-hidden group border border-slate-100">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <AlertTriangle className="h-20 w-20 text-slate-900" />
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">Agotado Total</p>
          <p className="text-6xl font-black text-slate-950 tracking-tighter">{outOfStock.length}</p>
        </Card>
      </div>

      {/* Main Catalog View */}
      <Card className="bg-white rounded-[3.5rem] border-none shadow-2xl overflow-hidden">
        <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row gap-8">
            <div className="relative flex-1 group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-400 group-focus-within:text-red-600 transition-colors" />
              <Input 
                placeholder="Filtrar por nombre o SKU técnico..." 
                className="pl-16 h-20 bg-slate-50 border-none rounded-[1.5rem] shadow-inner focus-visible:ring-2 focus-visible:ring-red-100 transition-all font-bold text-lg"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v || 'all')}>
              <SelectTrigger className="w-full md:w-[320px] h-20 bg-slate-50 border-none rounded-[1.5rem] shadow-inner font-black text-slate-600 px-8">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent className="rounded-[1.5rem] border-slate-50 shadow-2xl">
                <SelectItem value="all" className="font-black">TODAS LAS CATEGORÍAS</SelectItem>
                {uniqueCategories.map(c => <SelectItem key={c} value={c} className="font-bold">{c.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/70 text-left">
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Especificación</th>
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Clasificación</th>
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Ciclo Vida</th>
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Stock</th>
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence mode="popLayout">
                {filtered.map((item, idx) => (
                  <motion.tr 
                    layout
                    key={item.docId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group hover:bg-red-50/30 transition-all cursor-default"
                  >
                    <td className="px-12 py-10">
                      <div className="flex items-center gap-6">
                        <div className="h-16 w-16 rounded-2xl bg-white shadow-md ring-1 ring-slate-100 flex items-center justify-center text-slate-900 font-black text-sm group-hover:bg-[#F40009] group-hover:text-white transition-all duration-500">
                          {item.sku.slice(0, 3)}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-xl tracking-tight leading-tight">{item.name}</p>
                          <p className="text-[10px] text-red-600 font-black uppercase tracking-[0.2em] mt-1">ID: {item.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-12 py-10">
                      <Badge className="bg-slate-900 text-white border-none px-4 py-1.5 rounded-xl font-black text-[9px] tracking-widest uppercase">
                        {item.category}
                      </Badge>
                    </td>
                    <td className="px-12 py-10">
                      <div className="flex items-center gap-3 text-slate-500">
                        <RefreshCw className="h-4 w-4" />
                        <span className="text-sm font-black">{item.replacementDays} días</span>
                      </div>
                    </td>
                    <td className="px-12 py-10">
                      <div className="space-y-2">
                        <div className={`inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl border-2 font-black text-sm shadow-sm ${stockColor(item.stock)}`}>
                          {item.stock} <span className="text-[9px] opacity-60 tracking-widest">UNIDADES</span>
                        </div>
                        <div className="stock-bar w-32">
                          <div
                            className={`stock-bar-fill ${item.stock === 0 ? 'bg-red-500' : item.stock <= LOW_STOCK_THRESHOLD ? 'bg-gradient-to-r from-orange-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'}`}
                            style={{ width: `${Math.min((item.stock / 100) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-12 py-10 text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => openAdjust(item)}
                        className="h-14 w-14 rounded-2xl bg-white shadow-md ring-1 ring-slate-100 hover:bg-[#F40009] hover:text-white transition-all group-hover:scale-110"
                      >
                        <Plus className="h-6 w-6" />
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Item Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-[3rem] border-none p-0 overflow-hidden shadow-2xl">
          <div className="bg-slate-950 p-10 text-white relative">
             <div className="absolute top-0 right-0 p-8 opacity-20">
                <PackagePlus className="h-20 w-20" />
             </div>
             <DialogHeader>
                <DialogTitle className="text-3xl font-black tracking-tight uppercase">Alta de Material</DialogTitle>
                <p className="text-slate-400 font-bold mt-2">Registrar nueva especificación en el catálogo corporativo.</p>
             </DialogHeader>
          </div>
          <form onSubmit={handleAdd} className="p-10 space-y-8 bg-white">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Código SKU</Label>
                <Input 
                  className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold" 
                  value={form.sku} 
                  onChange={e => setForm({...form, sku: e.target.value.toUpperCase()})}
                  placeholder="Ej: CAS-001"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Categoría</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v || ''})}>
                  <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Nombre Descriptivo</Label>
              <Input 
                className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold" 
                value={form.name} 
                onChange={e => setForm({...form, name: e.target.value})}
                placeholder="Ej: Casco Pro-Vent Red"
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Vida Útil (Días)</Label>
                <Input 
                  type="number" 
                  className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold" 
                  value={form.replacementDays} 
                  onChange={e => setForm({...form, replacementDays: e.target.value})}
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Stock Inicial</Label>
                <Input 
                  type="number" 
                  className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold" 
                  value={form.stock} 
                  onChange={e => setForm({...form, stock: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter className="pt-6">
              <Button type="submit" disabled={saving} className="w-full h-16 rounded-[1.5rem] bg-[#F40009] hover:bg-slate-900 text-white font-black uppercase tracking-widest shadow-2xl">
                {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : "Confirmar Registro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[3rem] border-none p-0 overflow-hidden shadow-2xl">
          <div className="bg-[#F40009] p-10 text-white">
             <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tight">Ajuste de Existencias</DialogTitle>
                <p className="text-white/70 font-bold mt-1">{adjustItem?.name}</p>
             </DialogHeader>
          </div>
          <form onSubmit={handleAdjust} className="p-10 space-y-8 bg-white">
            <div className="flex bg-slate-100 p-2 rounded-2xl">
               <Button type="button" variant={adjustType === 'add' ? 'default' : 'ghost'} onClick={() => setAdjustType('add')} className={`flex-1 h-14 rounded-xl font-black ${adjustType === 'add' ? 'bg-slate-950 text-white shadow-xl' : 'text-slate-400'}`}>+ AÑADIR</Button>
               <Button type="button" variant={adjustType === 'subtract' ? 'default' : 'ghost'} onClick={() => setAdjustType('subtract')} className={`flex-1 h-14 rounded-xl font-black ${adjustType === 'subtract' ? 'bg-slate-950 text-white shadow-xl' : 'text-slate-400'}`}>- QUITAR</Button>
               <Button type="button" variant={adjustType === 'set' ? 'default' : 'ghost'} onClick={() => setAdjustType('set')} className={`flex-1 h-14 rounded-xl font-black ${adjustType === 'set' ? 'bg-slate-950 text-white shadow-xl' : 'text-slate-400'}`}>= SET</Button>
            </div>
            
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Cantidad a procesar</Label>
              <Input 
                type="number" 
                className="h-20 text-center text-4xl font-black rounded-3xl bg-slate-50 border-none shadow-inner" 
                value={adjustQty} 
                onChange={e => setAdjustQty(e.target.value)}
                autoFocus
              />
            </div>
            
            <DialogFooter>
               <Button type="submit" disabled={adjustSaving} className="w-full h-16 rounded-[1.5rem] bg-slate-950 hover:bg-[#F40009] text-white font-black uppercase tracking-widest shadow-2xl transition-all">
                  {adjustSaving ? <Loader2 className="h-6 w-6 animate-spin" /> : "Aplicar Movimiento"}
               </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
