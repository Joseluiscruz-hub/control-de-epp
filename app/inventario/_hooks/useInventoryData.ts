"use client";

import { useCallback, useEffect, useState } from 'react';
import {
  collection, onSnapshot, doc, getDoc,
  serverTimestamp, query, where, writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import {
  buildInventoryCatalogPayload,
  buildKioskCatalogPayload,
  hasBlockingInventoryIssues,
  parseInventoryTsv,
  type ParsedInventoryImport,
} from '@/lib/inventory-import';
import {
  adjustLocalInventoryStock,
  listLocalInventory,
  upsertLocalCatalogItem,
} from '@/lib/kiosk-local-store';
import { PPECatalogItem } from '@/lib/kiosk-types';
import { getEppDurationRulePayload, resolveEppReplacementDays } from '@/lib/epp-duration-rules';
import { normalizePlantId } from '@/lib/plants';
import { usePlantStore } from '@/store/usePlantStore';

/* ── Shared Types ──────────────────────────────── */

export interface PpeSizeVariant {
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

export interface PpeItem {
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
  plantaId?: string;
  createdAt?: Date;
}

/* ── Constants ─────────────────────────────────── */

export const CATEGORIES = [
  'Guantes', 'Cascos', 'Calzado', 'Gafas',
  'Proteccion Auditiva', 'Respiradores', 'Ropa',
  'Arneses', 'Otros'
];

export const LOW_STOCK_THRESHOLD = 20;

/* ── Helpers ───────────────────────────────────── */

async function readExistingDocumentIds(
  collectionName: 'ppe_catalog' | 'kiosk_catalog',
  ids: string[]
) {
  const existing = new Set<string>();
  for (let index = 0; index < ids.length; index += 60) {
    const chunk = ids.slice(index, index + 60);
    const snapshots = await Promise.all(
      chunk.map(id => getDoc(doc(db, collectionName, id)))
    );
    snapshots.forEach((snapshot, offset) => {
      if (snapshot.exists()) existing.add(chunk[offset]);
    });
  }
  return existing;
}

export function stockColor(stock: number) {
  if (stock === 0) return 'text-red-400 bg-red-400/10 border-red-400/20';
  if (stock <= LOW_STOCK_THRESHOLD) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
  return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}

/* ── Hook ──────────────────────────────────────── */

export function useInventoryData() {
  const [items, setItems] = useState<PpeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // Add-item dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sku: '', name: '', category: '', replacementDays: '', stock: ''
  });

  // Import dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<ParsedInventoryImport | null>(null);
  const [importingInventory, setImportingInventory] = useState(false);

  // Adjust dialog state
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<PpeItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustSize, setAdjustSize] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);

  const { activePlantId } = usePlantStore();
  const writePlantId = normalizePlantId(activePlantId);

  /* ── Local fallback loader ───────────────────── */
  const loadLocalInventory = useCallback(() => {
    setItems(listLocalInventory());
    setLoading(false);
  }, []);

  /* ── Firestore listener ──────────────────────── */
  useEffect(() => {
    try {
      const q = activePlantId === 'todas'
        ? query(collection(db, 'ppe_catalog'))
        : query(collection(db, 'ppe_catalog'), where('plantaId', '==', activePlantId));
      const unsub = onSnapshot(q, (snap) => {
        const data = snap.docs.map(d => {
          const item = d.data();
          const sizes = item.sizes as Record<string, PpeSizeVariant> | undefined;
          const sizeStock = sizes
            ? Object.values(sizes).reduce((sum, variant) => sum + (variant.stock ?? 0), 0)
            : 0;
          const replacementDays = resolveEppReplacementDays(
            {
              sku: item.sku ?? d.id,
              material: item.material,
              name: item.name,
              sizes,
            },
            Number(item.replacementDays ?? 365)
          );

          return {
            docId: d.id,
            sku: item.sku ?? d.id,
            name: item.name,
            category: item.category,
            replacementDays,
            stock: typeof item.stock === 'number' ? item.stock : sizeStock,
            hasSizes: item.hasSizes,
            sizes,
            material: item.material,
            location: item.location,
            unit: item.unit,
            unitCost: item.unitCost,
            plantaId: item.plantaId,
            createdAt: item.createdAt?.toDate(),
          };
        });
        setItems(data);
        setLoading(false);
      }, () => loadLocalInventory());
      return () => unsub();
    } catch {
      const timeout = window.setTimeout(() => {
        loadLocalInventory();
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [activePlantId, loadLocalInventory]);

  /* ── Computed values ─────────────────────────── */
  const filtered = items.filter(it => {
    const matchSearch = it.name.toLowerCase().includes(search.toLowerCase()) ||
      it.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || it.category === filterCategory;
    return matchSearch && matchCat;
  });

  const totalStock = items.reduce((sum, i) => sum + i.stock, 0);
  const lowStockItems = items.filter(i => i.stock <= LOW_STOCK_THRESHOLD && i.stock > 0);
  const outOfStock = items.filter(i => i.stock === 0);
  const uniqueCategories = Array.from(new Set(items.map(i => i.category)));
  const importHasBlockingIssues = importPreview ? hasBlockingInventoryIssues(importPreview) : false;

  /* ── File import handler ─────────────────────── */
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

  /* ── Save inventory locally (fallback) ───────── */
  const saveInventoryLocally = (preview: ParsedInventoryImport) => {
    preview.items.forEach((item) => {
      upsertLocalCatalogItem({
        id: item.id,
        ...buildInventoryCatalogPayload(item),
        plantaId: writePlantId,
      } as PPECatalogItem);
    });
    setItems(listLocalInventory());
    setImportOpen(false);
    resetInventoryImport();
    return preview.items.length;
  };

  /* ── Import to Firestore ─────────────────────── */
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
            plantaId: writePlantId,
            ...(exists ? {} : { createdAt: serverTimestamp() }),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        batch.set(
          doc(db, 'kiosk_catalog', item.id),
          {
            ...kioskPayload,
            plantaId: writePlantId,
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
      saveInventoryLocally(importPreview);

      toast.success(`Inventario cargado: ${created} nuevos, ${updated} actualizados.`);
    } catch (error) {
      console.error('[Inventory import write error]', error);
      const total = saveInventoryLocally(importPreview);
      toast.warning(`Sin conexión con servidor. Inventario guardado localmente con ${total} artículo(s).`);
    } finally {
      setImportingInventory(false);
    }
  };

  /* ── Add single item ─────────────────────────── */
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku || !form.name || !form.category || !form.replacementDays || !form.stock) return;
    setSaving(true);
    try {
      const initialStock = parseInt(form.stock);
      const ruleInput = { sku: form.sku, name: form.name };
      const replacementDays = resolveEppReplacementDays(ruleInput, parseInt(form.replacementDays));
      const rulePayload = getEppDurationRulePayload(ruleInput);
      const batch = writeBatch(db);

      batch.set(doc(db, 'ppe_catalog', form.sku), {
        sku: form.sku,
        name: form.name,
        category: form.category,
        replacementDays,
        ...rulePayload,
        plantaId: writePlantId,
        stock: initialStock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'kiosk_catalog', form.sku), {
        name: form.name,
        category: form.category,
        replacementDays,
        ...rulePayload,
        hasSizes: false,
        plantaId: writePlantId,
        sku: form.sku,
        stock: initialStock,
        minStock: 2,
        active: true,
        available: initialStock > 0,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      upsertLocalCatalogItem({
        id: form.sku,
        sku: form.sku,
        name: form.name,
        category: form.category,
        replacementDays,
        ...rulePayload,
        plantaId: writePlantId,
        stock: initialStock,
        minStock: 2,
        hasSizes: false,
        active: true,
        available: initialStock > 0,
      });
      toast.success(`Artículo "${form.name}" agregado al catálogo`);
      setForm({ sku: '', name: '', category: '', replacementDays: '', stock: '' });
      setAddOpen(false);
    } catch {
      const initialStock = parseInt(form.stock);
      const ruleInput = { sku: form.sku, name: form.name };
      const replacementDays = resolveEppReplacementDays(ruleInput, parseInt(form.replacementDays));
      const rulePayload = getEppDurationRulePayload(ruleInput);
      upsertLocalCatalogItem({
        id: form.sku,
        sku: form.sku,
        name: form.name,
        category: form.category,
        replacementDays,
        ...rulePayload,
        plantaId: writePlantId,
        stock: initialStock,
        minStock: 2,
        hasSizes: false,
        active: true,
        available: initialStock > 0,
      });
      setItems(listLocalInventory());
      toast.success(`Artículo "${form.name}" agregado localmente`);
      setForm({ sku: '', name: '', category: '', replacementDays: '', stock: '' });
      setAddOpen(false);
    } finally {
      setSaving(false);
    }
  };

  /* ── Adjust stock ────────────────────────────── */
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
          plantaId: adjustItem.plantaId ?? writePlantId,
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
        adjustLocalInventoryStock({ itemId: adjustItem.docId, qty, type: adjustType, size: adjustSize });

        const label = adjustType === 'add' ? `+${qty}` : adjustType === 'subtract' ? `-${qty}` : `= ${qty}`;
        toast.success(`Stock de "${adjustItem.name}" talla ${adjustSize} actualizado (${label})`);
        setAdjustOpen(false);
        setAdjustQty('');
        return;
      }

      let nextStock = adjustItem.stock;
      if (adjustType === 'add') {
        nextStock = adjustItem.stock + qty;
      } else if (adjustType === 'subtract') {
        nextStock = adjustItem.stock - qty;
      } else {
        nextStock = qty;
      }
      nextStock = Math.max(0, nextStock);
      const batch = writeBatch(db);
      batch.update(doc(db, 'ppe_catalog', adjustItem.docId), {
        stock: nextStock,
        available: nextStock > 0,
        plantaId: adjustItem.plantaId ?? writePlantId,
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'kiosk_catalog', adjustItem.docId),
        {
          name: adjustItem.name,
          category: adjustItem.category,
          replacementDays: adjustItem.replacementDays,
          hasSizes: false,
          plantaId: adjustItem.plantaId ?? writePlantId,
          sku: adjustItem.sku,
          stock: nextStock,
          minStock: 2,
          active: true,
          available: nextStock > 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();
      adjustLocalInventoryStock({ itemId: adjustItem.docId, qty, type: adjustType });
      const label = adjustType === 'add' ? `+${qty}` : adjustType === 'subtract' ? `-${qty}` : `= ${qty}`;
      toast.success(`Stock de "${adjustItem.name}" actualizado (${label})`);
      setAdjustOpen(false);
      setAdjustQty('');
    } catch {
      try {
        adjustLocalInventoryStock({ itemId: adjustItem.docId, qty, type: adjustType, size: adjustSize || undefined });
        setItems(listLocalInventory());
        const label = adjustType === 'add' ? `+${qty}` : adjustType === 'subtract' ? `-${qty}` : `= ${qty}`;
        toast.success(`Stock de "${adjustItem.name}" actualizado localmente (${label})`);
        setAdjustOpen(false);
        setAdjustQty('');
      } catch {
        toast.error('Error al ajustar el stock');
      }
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

  return {
    // Data
    items,
    loading,
    filtered,
    totalStock,
    lowStockItems,
    outOfStock,
    uniqueCategories,

    // Search & filter
    search,
    setSearch,
    filterCategory,
    setFilterCategory,

    // Add dialog
    addOpen,
    setAddOpen,
    saving,
    form,
    setForm,
    handleAdd,

    // Import dialog
    importOpen,
    setImportOpen,
    importFileName,
    importPreview,
    importingInventory,
    importHasBlockingIssues,
    handleInventoryFile,
    resetInventoryImport,
    importInventoryBase,

    // Adjust dialog
    adjustOpen,
    setAdjustOpen,
    adjustItem,
    adjustQty,
    setAdjustQty,
    adjustType,
    setAdjustType,
    adjustSize,
    setAdjustSize,
    adjustSaving,
    handleAdjust,
    openAdjust,
  };
}
