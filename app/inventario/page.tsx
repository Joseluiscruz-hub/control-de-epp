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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-12 pb-20"
    >
      {/* Header - Industrial Premium */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-white/40 backdrop-blur-xl p-10 rounded-[3rem] border border-white/60 shadow-xl shadow-slate-200/20">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-[0.2em]">Inventory Control Center</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-slate-900">Catálogo de EPP</h1>
          <p className="text-slate-500 font-medium text-lg">Gestión centralizada de stock, categorías y ciclos de vida útil.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <Button
            onClick={() => setAddOpen(true)}
            className="h-16 px-8 rounded-[2rem] bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xl shadow-indigo-200 transition-all font-black uppercase tracking-widest text-xs gap-3 active:scale-95"
          >
            <PackagePlus className="h-5 w-5" />
            Nuevo Artículo
          </Button>
        </div>
      </div>

      {/* Stats Summary - Mini Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-8 rounded-[2.5rem] flex items-center justify-between group hover:bg-white transition-all duration-500">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total de Unidades</p>
            <p className="text-4xl font-black text-slate-900 font-display">{totalStock.toLocaleString()}</p>
          </div>
          <div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner group-hover:scale-110 transition-transform">
            <Package className="h-7 w-7" />
          </div>
        </div>
        
        <div className="glass-card p-8 rounded-[2.5rem] flex items-center justify-between group hover:bg-white transition-all duration-500">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Stock Bajo</p>
            <p className="text-4xl font-black text-orange-600 font-display">{lowStockItems.length}</p>
          </div>
          <div className="h-14 w-14 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 shadow-inner group-hover:scale-110 transition-transform">
            <TrendingDown className="h-7 w-7" />
          </div>
        </div>

        <div className="glass-card p-8 rounded-[2.5rem] flex items-center justify-between group hover:bg-white transition-all duration-500">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Agotados</p>
            <p className="text-4xl font-black text-red-600 font-display">{outOfStock.length}</p>
          </div>
          <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 shadow-inner group-hover:scale-110 transition-transform">
            <AlertTriangle className="h-7 w-7" />
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <Card className="glass-card rounded-[3rem] border-none overflow-hidden bg-white/50 backdrop-blur-xl">
        <div className="p-10 border-b border-slate-100 space-y-8">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="relative flex-1 group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
              <Input 
                placeholder="Buscar por nombre o SKU..." 
                className="pl-14 h-16 bg-white border-slate-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-lg"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full md:w-[280px] h-16 bg-white border-slate-100 rounded-2xl shadow-sm font-bold text-slate-600 px-6">
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-slate-100 shadow-2xl">
                <SelectItem value="all" className="font-bold">Todas las categorías</SelectItem>
                {uniqueCategories.map(c => <SelectItem key={c} value={c} className="font-medium">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto custom-scroll">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Material</th>
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Categoría</th>
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Vida Útil</th>
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Stock Actual</th>
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence mode="popLayout">
                {filtered.map((item, idx) => (
                  <motion.tr 
                    layout
                    key={item.docId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group hover:bg-indigo-50/50 transition-all cursor-default"
                  >
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 flex items-center justify-center text-slate-400 font-black text-xs group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                          {item.sku}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-lg leading-tight mb-1">{item.name}</p>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest font-mono">SKU: {item.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <Badge variant="outline" className="rounded-xl px-4 py-1.5 font-bold border-slate-200 text-slate-500 bg-white">
                        {item.category}
                      </Badge>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-2 text-slate-600">
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span className="text-sm font-black">{item.replacementDays} días</span>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-2xl border font-black text-sm shadow-sm ${stockColor(item.stock)}`}>
                        {item.stock} <span className="text-[10px] opacity-70">UNIDADES</span>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => openAdjust(item)}
                        className="h-12 w-12 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm ring-1 ring-slate-100 group-hover:ring-indigo-200"
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
      </Card>
      
      {/* ... Add/Adjust Dialogs ... */}
    </motion.div>
  );
}
