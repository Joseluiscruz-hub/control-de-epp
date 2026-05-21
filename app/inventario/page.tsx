"use client";

import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, doc, getDoc,
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
  Loader2, Plus, RefreshCw, Database, Upload, FileWarning, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  buildInventoryCatalogPayload,
  buildKioskCatalogPayload,
  hasBlockingInventoryIssues,
  parseInventoryTsv,
  type ParsedInventoryImport,
} from '@/lib/inventory-import';

interface PpeSizeVariant {
  sku: string;
  stock?: number;
  minStock?: number;
  available?: boolean;
  material?: string;
  location?: string;
  unit?: string;
  unitCost?: number;
  temporarySku?: boolean;
}

interface PpeItem {
  docId: string;
  sku: string;
  name: string;
  category: string;
  replacementDays: number;
  stock: number;
  hasSizes?: boolean;
  sizes?: Record<string, PpeSizeVariant>;
  material?: string;
  location?: string;
  unit?: string;
  unitCost?: number;
  createdAt?: Date;
}

const CATEGORIES = [
  'Guantes', 'Cascos', 'Calzado', 'Gafas',
  'Proteccion Auditiva', 'Respiradores', 'Ropa',
  'Arneses', 'Otros'
];

const LOW_STOCK_THRESHOLD = 20;

async function readExistingDocumentIds(collectionName: 'ppe_catalog' | 'kiosk_catalog', ids: string[]) {
  const existing = new Set<string>();
  for (let index = 0; index < ids.length; index += 60) {
    const chunk = ids.slice(index, index + 60);
    const snapshots = await Promise.all(chunk.map(id => getDoc(doc(db, collectionName, id))));
    snapshots.forEach((snapshot, offset) => {
      if (snapshot.exists()) existing.add(chunk[offset]);
    });
  }
  return existing;
}

export default function InventarioPage() {
  const [items, setItems] = useState<PpeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<ParsedInventoryImport | null>(null);
  const [saving, setSaving] = useState(false);
  const [importingInventory, setImportingInventory] = useState(false);
  const [form, setForm] = useState({
    sku: '', name: '', category: '', replacementDays: '', stock: ''
  });

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<PpeItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustSize, setAdjustSize] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'ppe_catalog'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => {
        const item = d.data();
        const sizes = item.sizes as Record<string, PpeSizeVariant> | undefined;
        const sizeStock = sizes
          ? Object.values(sizes).reduce((sum, variant) => sum + (variant.stock ?? 0), 0)
          : 0;

        return {
          docId: d.id,
          sku: item.sku ?? d.id,
          name: item.name,
          category: item.category,
          replacementDays: item.replacementDays,
          stock: typeof item.stock === 'number' ? item.stock : sizeStock,
          hasSizes: item.hasSizes,
          sizes,
          material: item.material,
          location: item.location,
          unit: item.unit,
          unitCost: item.unitCost,
          createdAt: item.createdAt?.toDate(),
        };
      });
      setItems(data);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const handleInventoryFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseInventoryTsv(text);
      setImportFileName(file.name);
      setImportPreview(parsed);

      if (hasBlockingInventoryIssues(parsed)) {
        toast.error('El inventario tiene errores de formato. Revisa la vista previa.');
      } else {
        toast.success(`Inventario validado: ${parsed.summary.itemCount} artículos y ${parsed.summary.variantCount} variantes.`);
      }
    } catch (error) {
      console.error('[Inventory import parse error]', error);
      toast.error('No se pudo leer el inventario de EPP');
    }
  };

  const resetInventoryImport = () => {
    setImportFileName('');
    setImportPreview(null);
  };

  const importInventoryBase = async () => {
    if (!importPreview || hasBlockingInventoryIssues(importPreview) || importPreview.items.length === 0) return;

    setImportingInventory(true);
    try {
      const itemIds = importPreview.items.map(item => item.id);
      const [existingCatalog, existingKioskCatalog] = await Promise.all([
        readExistingDocumentIds('ppe_catalog', itemIds),
        readExistingDocumentIds('kiosk_catalog', itemIds),
      ]);

      let batch = writeBatch(db);
      let writes = 0;
      let created = 0;
      let updated = 0;

      const commitIfNeeded = async (force = false) => {
        if (writes === 0 || (!force && writes < 440)) return;
        await batch.commit();
        batch = writeBatch(db);
        writes = 0;
      };

      for (const item of importPreview.items) {
        const exists = existingCatalog.has(item.id);
        const catalogPayload = buildInventoryCatalogPayload(item);
        const kioskPayload = buildKioskCatalogPayload(item);

        batch.set(
          doc(db, 'ppe_catalog', item.id),
          {
            ...catalogPayload,
            ...(exists ? {} : { createdAt: serverTimestamp() }),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        batch.set(
          doc(db, 'kiosk_catalog', item.id),
          {
            ...kioskPayload,
            ...(existingKioskCatalog.has(item.id) ? {} : { createdAt: serverTimestamp() }),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (exists) updated++;
        else created++;

        writes += 2;
        await commitIfNeeded();
      }

      await commitIfNeeded(true);

      toast.success(`Inventario cargado: ${created} nuevos, ${updated} actualizados.`);
      setImportOpen(false);
      resetInventoryImport();
    } catch (error) {
      console.error('[Inventory import write error]', error);
      toast.error('No se pudo cargar el inventario. Verifica permisos de admin y reglas de Firebase.');
    } finally {
      setImportingInventory(false);
    }
  };

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
      if (adjustItem.hasSizes && adjustItem.sizes) {
        const currentVariant = adjustItem.sizes[adjustSize];
        if (!currentVariant) {
          toast.error('Selecciona una talla válida');
          return;
        }

        let nextVariantStock = currentVariant.stock ?? 0;
        if (adjustType === 'add') {
          nextVariantStock += qty;
        } else if (adjustType === 'subtract') {
          nextVariantStock -= qty;
        } else {
          nextVariantStock = qty;
        }
        nextVariantStock = Math.max(0, nextVariantStock);

        const nextSizes = {
          ...adjustItem.sizes,
          [adjustSize]: {
            ...currentVariant,
            stock: nextVariantStock,
            available: nextVariantStock > 0,
          },
        };
        const nextTotalStock = Object.values(nextSizes).reduce((sum, variant) => sum + (variant.stock ?? 0), 0);

        const batch = writeBatch(db);
        const payload = {
          name: adjustItem.name,
          category: adjustItem.category,
          replacementDays: adjustItem.replacementDays,
          hasSizes: true,
          sizes: nextSizes,
          sku: adjustItem.sku,
          stock: nextTotalStock,
          active: true,
          available: nextTotalStock > 0,
          updatedAt: serverTimestamp(),
        };

        batch.set(doc(db, 'ppe_catalog', adjustItem.docId), payload, { merge: true });
        batch.set(doc(db, 'kiosk_catalog', adjustItem.docId), payload, { merge: true });
        await batch.commit();

        const label = adjustType === 'add' ? `+${qty}` : adjustType === 'subtract' ? `-${qty}` : `= ${qty}`;
        toast.success(`Stock de "${adjustItem.name}" talla ${adjustSize} actualizado (${label})`);
        setAdjustOpen(false);
        setAdjustQty('');
        return;
      }

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
    setAdjustSize(item.sizes ? Object.keys(item.sizes)[0] ?? '' : '');
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
  const importHasBlockingIssues = importPreview ? hasBlockingInventoryIssues(importPreview) : false;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-6 pb-20"
    >
      {/* ── Header ───────────────────────────────── */}
      <div className="executive-hero flex flex-col lg:flex-row lg:items-center justify-between gap-8 p-8">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-red-600/10 to-transparent pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3">
             <span className="badge-femsa">Catálogo Maestro</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white">
            Inventario <span className="text-gradient-red">FEMSA</span>
          </h1>
          <p className="text-white/55 font-medium text-base max-w-xl">
            Control de activos críticos y gestión de suministros de seguridad industrial.
          </p>
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row gap-4">
          <Button
            onClick={() => setImportOpen(true)}
            className="h-12 px-5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold uppercase tracking-widest text-xs gap-3 group"
          >
            <Database className="h-5 w-5 group-hover:scale-110 transition-transform text-sky-400" />
            Cargar Base EPP
          </Button>
          <Button
            onClick={() => setAddOpen(true)}
            className="h-12 px-5 rounded-lg bg-[#F40009] hover:bg-red-700 text-white shadow-lg shadow-red-950/30 transition-all font-bold uppercase tracking-widest text-xs gap-3 group"
          >
            <PackagePlus className="h-5 w-5 group-hover:rotate-12 transition-transform" />
            Añadir Material
          </Button>
        </div>
      </div>

      {/* ── Mini Bento ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="kpi-card p-6 group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <Package className="h-20 w-20 text-white" />
          </div>
          <p className="section-eyebrow mb-2">Unidades Totales</p>
          <p className="text-4xl font-black text-white tracking-tight">{totalStock.toLocaleString()}</p>
        </div>
        
        <div className="kpi-card p-6 group" style={{borderColor: 'rgba(245,158,11,0.2)'}}>
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <TrendingDown className="h-20 w-20 text-orange-500" />
          </div>
          <p className="section-eyebrow mb-2" style={{color:'rgba(251,146,60,0.82)'}}>Stock Crítico</p>
          <p className="text-4xl font-black text-orange-400 tracking-tight">{lowStockItems.length}</p>
        </div>

        <div className="kpi-card p-6 group" style={{borderColor: 'rgba(244,0,9,0.2)'}}>
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <AlertTriangle className="h-20 w-20 text-red-500" />
          </div>
          <p className="section-eyebrow mb-2" style={{color:'rgba(248,113,113,0.82)'}}>Agotado Total</p>
          <p className="text-4xl font-black text-red-500 tracking-tight">{outOfStock.length}</p>
        </div>
      </div>

      {/* ── Main Catalog View ────────────────────── */}
      <div className="enterprise-panel">
        <div className="p-5 border-b border-white/10 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 group-focus-within:text-[#F40009] transition-colors" />
              <Input 
                placeholder="Filtrar por nombre o SKU técnico..." 
                className="pl-14 h-12 bg-white/5 border-white/10 rounded-lg focus-visible:ring-[#F40009] transition-all font-medium text-white placeholder:text-white/30"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v || 'all')}>
              <SelectTrigger className="w-full md:w-[320px] h-12 bg-white/5 border-white/10 rounded-lg text-white font-medium px-5">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent className="rounded-lg bg-[#10151d] border-white/10 text-white">
                <SelectItem value="all" className="font-bold text-white/70">TODAS LAS CATEGORÍAS</SelectItem>
                {uniqueCategories.map(c => <SelectItem key={c} value={c} className="font-medium">{c.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full premium-table">
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
                          <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                            ID: {item.sku}
                            {item.hasSizes && item.sizes ? ` · ${Object.keys(item.sizes).length} tallas` : ''}
                          </p>
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
                        {item.hasSizes && item.sizes && (
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/35">
                            Stock consolidado por talla
                          </p>
                        )}
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

      {/* ── Inventory Import Dialog ─────────────── */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open && !importingInventory) resetInventoryImport();
        }}
      >
        <DialogContent className="sm:max-w-4xl rounded-[2rem] border border-white/10 p-0 overflow-hidden shadow-2xl bg-[#040813]">
          <div className="bg-white/5 p-8 relative border-b border-white/10">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Database className="h-20 w-20 text-white" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight text-white uppercase">Base Maestra de EPP</DialogTitle>
              <p className="text-white/50 font-medium mt-1">Carga controlada de materiales, tallas, ubicaciones y stock de planta.</p>
            </DialogHeader>
          </div>

          <div className="p-8 space-y-6 max-h-[72vh] overflow-y-auto">
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Archivo TSV / TXT de inventario</Label>
              <Input
                type="file"
                accept=".txt,.tsv,text/plain,text/tab-separated-values"
                onChange={handleInventoryFile}
                disabled={importingInventory}
                className="mt-3 h-14 rounded-xl bg-white/5 border-white/10 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-[#F40009] file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-widest file:text-white hover:file:bg-red-700"
              />
              {importFileName && (
                <div className="mt-4 flex items-center gap-3 text-sm font-bold text-white/70">
                  <Upload className="h-4 w-4 text-sky-400" />
                  {importFileName}
                </div>
              )}
            </div>

            {importPreview && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="section-eyebrow mb-2">Artículos</p>
                    <p className="text-3xl font-black text-white">{importPreview.summary.itemCount}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="section-eyebrow mb-2">Variantes</p>
                    <p className="text-3xl font-black text-white">{importPreview.summary.variantCount}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="section-eyebrow mb-2">Stock Total</p>
                    <p className="text-3xl font-black text-emerald-400">{importPreview.summary.totalStock.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="section-eyebrow mb-2">Estado</p>
                    <p className={`text-sm font-black uppercase tracking-widest ${importHasBlockingIssues ? 'text-red-400' : 'text-emerald-400'}`}>
                      {importHasBlockingIssues ? 'Bloqueado' : 'Listo'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">Categorías Detectadas</h3>
                    <div className="space-y-3">
                      {Object.entries(importPreview.summary.byCategory).map(([categoryName, total]) => (
                        <div key={categoryName} className="flex items-center justify-between gap-4">
                          <span className="text-xs font-bold uppercase tracking-widest text-white/65">{categoryName}</span>
                          <span className="rounded-lg bg-white/10 px-3 py-1 text-[10px] font-black text-white">{total}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">Validación</h3>
                    {importPreview.issues.length === 0 ? (
                      <div className="flex items-center gap-3 text-emerald-400 font-bold text-sm">
                        <CheckCircle2 className="h-5 w-5" />
                        Formato validado sin incidencias.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {importPreview.issues.slice(0, 7).map((issue, index) => (
                          <div key={`${issue.row}-${index}`} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                            <FileWarning className={`mt-0.5 h-4 w-4 ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`} />
                            <div>
                              <p className={`text-[10px] font-black uppercase tracking-widest ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                                Fila {issue.row} · {issue.severity === 'error' ? 'Error' : 'Aviso'}
                              </p>
                              <p className="text-xs font-medium text-white/65 mt-1">{issue.message}</p>
                            </div>
                          </div>
                        ))}
                        {importPreview.issues.length > 7 && (
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                            +{importPreview.issues.length - 7} incidencias adicionales
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300 mb-2">SKU temporales</p>
                  <p className="text-sm font-medium leading-relaxed text-white/60">
                    {importPreview.summary.temporarySkuCount} variantes no traen código de material. Se cargarán con SKU temporal estable para completar tallas y se podrán reemplazar cuando tengamos el código real.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="border-t border-white/10 p-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setImportOpen(false)}
              disabled={importingInventory}
              className="h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] text-white/50 hover:text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={importInventoryBase}
              disabled={!importPreview || importHasBlockingIssues || importingInventory || importPreview.items.length === 0}
              className="h-12 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest text-xs px-6"
            >
              {importingInventory ? <Loader2 className="h-5 w-5 animate-spin" /> : `Cargar ${importPreview?.summary.itemCount ?? 0} artículos`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {adjustItem?.hasSizes && adjustItem.sizes && (
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Talla / Variante</Label>
                <Select value={adjustSize} onValueChange={v => setAdjustSize(v || '')}>
                  <SelectTrigger className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-medium">
                    <SelectValue placeholder="Seleccionar talla..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1628] border-white/10 text-white rounded-xl">
                    {Object.entries(adjustItem.sizes).map(([size, variant]) => (
                      <SelectItem key={size} value={size}>
                        {size} · Stock {variant.stock ?? 0} · {variant.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
