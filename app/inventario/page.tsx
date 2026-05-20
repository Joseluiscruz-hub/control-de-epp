"use client";

import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, doc, setDoc,
  serverTimestamp, query, increment, writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Package, PackagePlus, Search, AlertTriangle, TrendingDown,
  Loader2, Plus, RefreshCw
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

export default function InventarioPage() {
  const [items, setItems] = useState<PpeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sku: '', name: '', category: '', replacementDays: '', stock: ''
  });

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
      const initialStock = parseInt(form.stock);
      const replacementDays = parseInt(form.replacementDays);
      const batch = writeBatch(db);

      batch.set(doc(db, 'ppe_catalog', form.sku), {
        sku: form.sku,
        name: form.name,
        category: form.category,
        replacementDays,
        stock: initialStock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'kiosk_catalog', form.sku), {
        name: form.name,
        category: form.category,
        replacementDays,
        hasSizes: false,
        sku: form.sku,
        active: true,
        available: initialStock > 0,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
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
      let nextStock = adjustItem.stock;
      let newStock: number | ReturnType<typeof increment>;
      if (adjustType === 'add') {
        newStock = increment(qty);
        nextStock = adjustItem.stock + qty;
      } else if (adjustType === 'subtract') {
        newStock = increment(-qty);
        nextStock = adjustItem.stock - qty;
      } else {
        newStock = qty;
        nextStock = qty;
      }
      const batch = writeBatch(db);
      batch.update(doc(db, 'ppe_catalog', adjustItem.docId), {
        stock: newStock,
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'kiosk_catalog', adjustItem.docId),
        {
          name: adjustItem.name,
          category: adjustItem.category,
          replacementDays: adjustItem.replacementDays,
          hasSizes: false,
          sku: adjustItem.sku,
          active: true,
          available: nextStock > 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();
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
    if (stock === 0) return 'text-red-400 bg-red-400/10 border-red-400/20';
    if (stock <= LOW_STOCK_THRESHOLD) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
  };

  const uniqueCategories = Array.from(new Set(items.map(i => i.category)));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-12 pb-20"
    >
      {/* ── Header ───────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 p-12 rounded-[3.5rem] relative overflow-hidden glass-card">
        <div className="absolute top-0 right-0 w-64 h-full bg-red-600/10 -mr-20 -skew-x-12 blur-2xl" />
        
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3">
             <span className="badge-femsa">Catálogo Maestro</span>
          </div>
          <h1 className="text-5xl lg:text-6xl font-black tracking-tighter text-white">
            Inventario <span className="text-gradient-red">FEMSA</span>
          </h1>
          <p className="text-white/50 font-medium text-lg max-w-xl">
            Control de activos críticos y gestión de suministros de seguridad industrial.
          </p>
        </div>
        
        <div className="relative z-10">
          <Button
            onClick={() => setAddOpen(true)}
            className="h-16 px-8 rounded-2xl bg-[#F40009] hover:bg-red-700 text-white shadow-[0_0_20px_rgba(244,0,9,0.3)] transition-all font-bold uppercase tracking-widest text-xs gap-3 group"
          >
            <PackagePlus className="h-5 w-5 group-hover:rotate-12 transition-transform" />
            Añadir Material
          </Button>
        </div>
      </div>

      {/* ── Mini Bento ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="kpi-card p-8 group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <Package className="h-20 w-20 text-white" />
          </div>
          <p className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Unidades Totales</p>
          <p className="text-5xl font-black text-white tracking-tighter">{totalStock.toLocaleString()}</p>
        </div>
        
        <div className="kpi-card p-8 group" style={{borderColor: 'rgba(245,158,11,0.2)'}}>
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <TrendingDown className="h-20 w-20 text-orange-500" />
          </div>
          <p className="text-[11px] font-black text-orange-500/80 uppercase tracking-[0.3em] mb-2">Stock Crítico</p>
          <p className="text-5xl font-black text-orange-400 tracking-tighter">{lowStockItems.length}</p>
        </div>

        <div className="kpi-card p-8 group" style={{borderColor: 'rgba(244,0,9,0.2)'}}>
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <AlertTriangle className="h-20 w-20 text-red-500" />
          </div>
          <p className="text-[11px] font-black text-red-500/80 uppercase tracking-[0.3em] mb-2">Agotado Total</p>
          <p className="text-5xl font-black text-red-500 tracking-tighter">{outOfStock.length}</p>
        </div>
      </div>

      {/* ── Main Catalog View ────────────────────── */}
      <div className="glass-card rounded-[2.5rem] overflow-hidden">
        <div className="p-8 border-b border-white/5 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 group-focus-within:text-[#F40009] transition-colors" />
              <Input 
                placeholder="Filtrar por nombre o SKU técnico..." 
                className="pl-14 h-14 bg-white/5 border-white/10 rounded-2xl focus-visible:ring-[#F40009] transition-all font-medium text-white placeholder:text-white/30"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v || 'all')}>
              <SelectTrigger className="w-full md:w-[320px] h-14 bg-white/5 border-white/10 rounded-2xl text-white font-medium px-6">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl bg-[#0A1628] border-white/10 text-white">
                <SelectItem value="all" className="font-bold text-white/70">TODAS LAS CATEGORÍAS</SelectItem>
                {uniqueCategories.map(c => <SelectItem key={c} value={c} className="font-medium">{c.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-white/5 text-left border-b border-white/10">
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Especificación</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Clasificación</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Ciclo Vida</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Stock</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout">
                {filtered.map((item, idx) => (
                  <motion.tr 
                    layout
                    key={item.docId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group hover:bg-white/[0.02] transition-colors cursor-default"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 font-black text-xs group-hover:bg-[#F40009]/20 group-hover:text-[#F40009] transition-all">
                          {item.sku.slice(0, 3)}
                        </div>
                        <div>
                          <p className="font-bold text-white text-lg tracking-tight">{item.name}</p>
                          <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">ID: {item.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-3 py-1.5 rounded-lg bg-white/10 text-white font-bold text-[9px] tracking-widest uppercase">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 text-white/50">
                        <RefreshCw className="h-4 w-4" />
                        <span className="text-sm font-bold">{item.replacementDays} días</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-2">
                        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg border font-bold text-[10px] tracking-widest uppercase ${stockColor(item.stock)}`}>
                          {item.stock} <span className="opacity-60">UNIDADES</span>
                        </div>
                        <div className="stock-bar w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${
                              item.stock === 0 ? 'bg-red-500' : item.stock <= LOW_STOCK_THRESHOLD ? 'bg-orange-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.min((item.stock / 100) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => openAdjust(item)}
                        className="h-10 w-10 rounded-xl bg-white/5 hover:bg-[#F40009] text-white/70 hover:text-white transition-all group-hover:scale-110"
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Item Dialog ──────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-[2rem] border border-white/10 p-0 overflow-hidden bg-[#040813]">
          <div className="bg-white/5 p-8 relative border-b border-white/10">
             <div className="absolute top-0 right-0 p-8 opacity-10">
                <PackagePlus className="h-20 w-20 text-white" />
             </div>
             <DialogHeader>
                <DialogTitle className="text-2xl font-black tracking-tight uppercase text-white">Alta de Material</DialogTitle>
                <p className="text-white/50 font-medium mt-1">Registrar nueva especificación en el catálogo corporativo.</p>
             </DialogHeader>
          </div>
          <form onSubmit={handleAdd} className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Código SKU</Label>
                <Input 
                  className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]" 
                  value={form.sku} 
                  onChange={e => setForm({...form, sku: e.target.value.toUpperCase()})}
                  placeholder="Ej: CAS-001"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Categoría</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v || ''})}>
                  <SelectTrigger className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-medium">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1628] border-white/10 text-white rounded-xl">
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Nombre Descriptivo</Label>
              <Input 
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]" 
                value={form.name} 
                onChange={e => setForm({...form, name: e.target.value})}
                placeholder="Ej: Casco Pro-Vent Red"
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Vida Útil (Días)</Label>
                <Input 
                  type="number" 
                  className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]" 
                  value={form.replacementDays} 
                  onChange={e => setForm({...form, replacementDays: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Stock Inicial</Label>
                <Input 
                  type="number" 
                  className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold focus-visible:ring-[#F40009]" 
                  value={form.stock} 
                  onChange={e => setForm({...form, stock: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="submit" disabled={saving} className="w-full h-14 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest transition-all">
                {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : "Confirmar Registro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Adjust Stock Dialog ──────────────────── */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-[2rem] border border-white/10 p-0 overflow-hidden bg-[#040813]">
          <div className="bg-[#F40009] p-8 text-white">
             <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase tracking-tight">Ajuste de Existencias</DialogTitle>
                <p className="text-white/80 font-medium mt-1">{adjustItem?.name}</p>
             </DialogHeader>
          </div>
          <form onSubmit={handleAdjust} className="p-8 space-y-6">
            <div className="flex bg-white/5 p-1.5 rounded-xl border border-white/10">
               <Button type="button" variant="ghost" onClick={() => setAdjustType('add')} className={`flex-1 h-10 rounded-lg font-bold text-[10px] tracking-widest ${adjustType === 'add' ? 'bg-white/15 text-white' : 'text-white/40'}`}>+ AÑADIR</Button>
               <Button type="button" variant="ghost" onClick={() => setAdjustType('subtract')} className={`flex-1 h-10 rounded-lg font-bold text-[10px] tracking-widest ${adjustType === 'subtract' ? 'bg-white/15 text-white' : 'text-white/40'}`}>- QUITAR</Button>
               <Button type="button" variant="ghost" onClick={() => setAdjustType('set')} className={`flex-1 h-10 rounded-lg font-bold text-[10px] tracking-widest ${adjustType === 'set' ? 'bg-white/15 text-white' : 'text-white/40'}`}>= SET</Button>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Cantidad a procesar</Label>
              <Input 
                type="number" 
                className="h-20 text-center text-4xl font-black rounded-2xl bg-white/5 border-white/10 text-white focus-visible:ring-[#F40009]" 
                value={adjustQty} 
                onChange={e => setAdjustQty(e.target.value)}
                autoFocus
              />
            </div>
            
            <DialogFooter>
               <Button type="submit" disabled={adjustSaving} className="w-full h-14 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest transition-all">
                  {adjustSaving ? <Loader2 className="h-6 w-6 animate-spin" /> : "Aplicar Movimiento"}
               </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
