"use client";

import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import {
  buildInventoryCatalogPayload,
  hasBlockingInventoryIssues,
  parseInventoryTsv,
  type ParsedInventoryImport,
} from '@/lib/inventory-import';
import {
  adjustLocalInventoryStock,
  canUseLocalFallback,
  listLocalInventory,
  upsertLocalCatalogItem,
} from '@/lib/kiosk-local-store';
import { PPECatalogItem } from '@/lib/kiosk-types';
import { getEppDurationRulePayload, resolveEppReplacementDays } from '@/lib/epp-duration-rules';
import { resolveStockFromPackageRule } from '@/lib/epp-package-rules';
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
  stockUnit?: 'PZA';
  packageUnit?: 'CAJA' | 'BOLSA';
  unitsPerPackage?: number;
  stockPackageInput?: number;
  packageRuleId?: string;
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
  stockUnit?: 'PZA';
  packageUnit?: 'CAJA' | 'BOLSA';
  unitsPerPackage?: number;
  stockPackageInput?: number;
  packageRuleId?: string;
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

export function stockColor(stock: number) {
  if (stock === 0) return 'text-red-400 bg-red-400/10 border-red-400/20';
  if (stock <= LOW_STOCK_THRESHOLD) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
  return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}

async function requireAdminToken() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('missing_admin_session');
  return token;
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
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
    if (!canUseLocalFallback()) {
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(listLocalInventory());
    setLoading(false);
  }, []);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('missing_admin_session');

      const response = await fetch(`/api/inventory/items?plant=${encodeURIComponent(activePlantId)}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'inventory_load_failed');
      }

      const data = (Array.isArray(result?.items) ? result.items : []).map((item: PpeItem & { createdAt?: string }) => {
          const sizes = item.sizes as Record<string, PpeSizeVariant> | undefined;
          const sizeStock = sizes
            ? Object.values(sizes).reduce((sum, variant) => sum + (variant.stock ?? 0), 0)
            : 0;
          const replacementDays = resolveEppReplacementDays(
            {
              sku: item.sku ?? item.docId,
              material: item.material,
              name: item.name,
              sizes,
            },
            Number(item.replacementDays ?? 365)
          );

          return {
            docId: item.docId,
            sku: item.sku ?? item.docId,
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
            stockUnit: item.stockUnit,
            packageUnit: item.packageUnit,
            unitsPerPackage: item.unitsPerPackage,
            stockPackageInput: item.stockPackageInput,
            packageRuleId: item.packageRuleId,
            plantaId: item.plantaId,
            createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
          };
      });

      setItems(data);
      setLoading(false);
    } catch (error) {
      console.error('[Inventory load error]', error);
      toast.error('No se pudo sincronizar el inventario desde Firebase.');
      loadLocalInventory();
    }
  }, [activePlantId, loadLocalInventory]);

  /* ── Server inventory loader ─────────────────── */
  useEffect(() => {
    void loadInventory();
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
      const token = await requireAdminToken();
      const response = await fetch('/api/inventory/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: importPreview.items, plantaId: writePlantId }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'inventory_import_failed');
      }
      setImportOpen(false);
      resetInventoryImport();
      await loadInventory();

      toast.success(`Inventario cargado: ${result.created ?? 0} nuevos, ${result.updated ?? 0} actualizados.`);
    } catch (error) {
      console.error('[Inventory import write error]', error);
      if (canUseLocalFallback()) {
        const total = saveInventoryLocally(importPreview);
        toast.warning(`Sin conexión con servidor. Inventario guardado localmente con ${total} artículo(s).`);
      } else {
        toast.error('No se pudo cargar el inventario en Firebase.');
      }
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
      const stockConversion = resolveStockFromPackageRule({ name: form.name, stockInput: initialStock });
      const token = await requireAdminToken();
      const response = await fetch('/api/inventory/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sku: form.sku,
          name: form.name,
          category: form.category,
          replacementDays,
          stock: initialStock,
          plantaId: writePlantId,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'inventory_item_save_failed'));
      }
      if (canUseLocalFallback()) {
        upsertLocalCatalogItem({
          id: form.sku,
          sku: form.sku,
          name: form.name,
          category: form.category,
          replacementDays,
          ...rulePayload,
          plantaId: writePlantId,
          stock: stockConversion.stock,
          ...stockConversion.metadata,
          unit: stockConversion.metadata?.stockUnit ?? 'PZA',
          minStock: 2,
          hasSizes: false,
          active: true,
          available: stockConversion.stock > 0,
        });
      }
      await loadInventory();
      toast.success(`Artículo "${form.name}" agregado al catálogo`);
      setForm({ sku: '', name: '', category: '', replacementDays: '', stock: '' });
      setAddOpen(false);
    } catch {
      const initialStock = parseInt(form.stock);
      const ruleInput = { sku: form.sku, name: form.name };
      const replacementDays = resolveEppReplacementDays(ruleInput, parseInt(form.replacementDays));
      const rulePayload = getEppDurationRulePayload(ruleInput);
      const stockConversion = resolveStockFromPackageRule({ name: form.name, stockInput: initialStock });
      if (canUseLocalFallback()) {
        upsertLocalCatalogItem({
          id: form.sku,
          sku: form.sku,
          name: form.name,
          category: form.category,
          replacementDays,
          ...rulePayload,
          plantaId: writePlantId,
          stock: stockConversion.stock,
          ...stockConversion.metadata,
          unit: stockConversion.metadata?.stockUnit ?? 'PZA',
          minStock: 2,
          hasSizes: false,
          active: true,
          available: stockConversion.stock > 0,
        });
        setItems(listLocalInventory());
        toast.success(`Artículo "${form.name}" agregado localmente`);
        setForm({ sku: '', name: '', category: '', replacementDays: '', stock: '' });
        setAddOpen(false);
      } else {
        toast.error('No se pudo agregar el material en Firebase.');
      }
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
      const token = await requireAdminToken();
      const response = await fetch('/api/inventory/stock', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          itemId: adjustItem.docId,
          size: adjustItem.hasSizes ? adjustSize : 'N/A',
          type: adjustType,
          quantity: qty,
          reason: 'Ajuste manual desde inventario',
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'inventory_stock_adjust_failed'));
      }
      if (canUseLocalFallback()) {
        adjustLocalInventoryStock({ itemId: adjustItem.docId, qty, type: adjustType, size: adjustItem.hasSizes ? adjustSize : undefined });
      }
      await loadInventory();
      const label = adjustType === 'add' ? `+${qty}` : adjustType === 'subtract' ? `-${qty}` : `= ${qty}`;
      toast.success(`Stock de "${adjustItem.name}" actualizado (${label})`);
      setAdjustOpen(false);
      setAdjustQty('');
    } catch {
      try {
        if (!canUseLocalFallback()) {
          throw new Error('local_fallback_disabled');
        }
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
