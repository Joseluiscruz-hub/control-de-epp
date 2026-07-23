"use client";

import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { playNotificationSound } from '@/lib/notification-sounds';
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
import { resolveEppReplacementDays } from '@/lib/epp-duration-rules';
import { normalizeManualSku, validateManualSku } from '@/lib/epp-master-catalog';
import { getEppReorderPoint } from '@/lib/epp-reorder-points';
import { normalizePlantId, plantLabel } from '@/lib/plants';
import { usePlantStore } from '@/store/usePlantStore';

/* ── Shared Types ──────────────────────────────── */

export interface PpeSizeVariant {
  sku: string;
  stock?: number;
  minStock?: number;
  reorderPoint?: number;
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
  minStock?: number;
  reorderPoint?: number;
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

export type StockFilter = 'all' | 'critical' | 'reorder' | 'out' | 'other';

export interface ReorderAlert {
  itemDocId: string;
  itemName: string;
  sku: string;
  material: string;
  size?: string;
  stock: number;
  reorderPoint: number;
  shortage: number;
  plantaId?: string;
}

/* ── Constants ─────────────────────────────────── */

export const CATEGORIES = [
  'Guantes', 'Cascos', 'Calzado', 'Gafas',
  'Proteccion Auditiva', 'Respiradores', 'Ropa',
  'Arneses', 'Otros'
];

export const LOW_STOCK_THRESHOLD = 20;

export interface ManualCatalogLookupState {
  status: 'idle' | 'loading' | 'found' | 'duplicate' | 'error';
  message: string;
  existsInPlant: boolean;
}

const EMPTY_CATALOG_LOOKUP: ManualCatalogLookupState = {
  status: 'idle',
  message: 'Ingresa un SKU para consultar el catálogo maestro.',
  existsInPlant: false,
};

const EMPTY_ITEM_FORM = {
  sku: '',
  material: '',
  name: '',
  category: '',
  replacementDays: '',
  stock: '',
  minStock: '',
  location: '',
  unit: 'PZA',
  unitCost: '',
};

/* ── Helpers ───────────────────────────────────── */

export function stockColor(stock: number) {
  if (stock === 0) return 'text-red-400 bg-red-400/10 border-red-400/20';
  if (stock <= LOW_STOCK_THRESHOLD) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
  return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}

function readEffectiveReorderPoint(explicit: unknown, ...codes: unknown[]) {
  return typeof explicit === 'number' && Number.isFinite(explicit)
    ? explicit
    : getEppReorderPoint(...codes);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getItemReorderAlerts(item: PpeItem): ReorderAlert[] {
  if (item.hasSizes && item.sizes) {
    return Object.entries(item.sizes)
      .map<ReorderAlert | null>(([size, variant]) => {
        const stock = numberValue(variant.stock);
        const reorderPoint = readEffectiveReorderPoint(variant.reorderPoint, variant.material, variant.sku);
        if (reorderPoint === undefined || stock > reorderPoint) return null;
        return {
          itemDocId: item.docId,
          itemName: item.name,
          sku: variant.sku || item.sku,
          material: variant.material || variant.sku || item.material || item.sku,
          size,
          stock,
          reorderPoint,
          shortage: Math.max(0, reorderPoint - stock),
          plantaId: item.plantaId,
        };
      })
      .filter((alert): alert is ReorderAlert => alert !== null);
  }

  const stock = numberValue(item.stock);
  const reorderPoint = readEffectiveReorderPoint(item.reorderPoint, item.material, item.sku);
  if (reorderPoint === undefined || stock > reorderPoint) return [];
  return [{
    itemDocId: item.docId,
    itemName: item.name,
    sku: item.sku,
    material: item.material || item.sku,
    stock,
    reorderPoint,
    shortage: Math.max(0, reorderPoint - stock),
    plantaId: item.plantaId,
  }];
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

class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

/* ── Hook ──────────────────────────────────────── */

export function useInventoryData() {
  const [items, setItems] = useState<PpeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStock, setFilterStock] = useState<StockFilter>('all');

  // Add-item dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_ITEM_FORM);
  const [catalogLookup, setCatalogLookup] = useState<ManualCatalogLookupState>(EMPTY_CATALOG_LOOKUP);

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

  const handleAddOpenChange = useCallback((open: boolean) => {
    setAddOpen(open);
    if (!open) {
      setForm(EMPTY_ITEM_FORM);
      setCatalogLookup(EMPTY_CATALOG_LOOKUP);
    }
  }, []);

  const handleAddFormChange = (nextForm: typeof EMPTY_ITEM_FORM) => {
    if (nextForm.sku !== form.sku) {
      const hasSku = normalizeManualSku(nextForm.sku) !== '';
      setCatalogLookup(hasSku
        ? {
            status: 'loading',
            message: 'Validando SKU...',
            existsInPlant: false,
          }
        : EMPTY_CATALOG_LOOKUP);
      setForm({
        ...nextForm,
        material: '',
        name: '',
        category: '',
        replacementDays: '',
        minStock: '',
        unit: 'PZA',
      });
      return;
    }

    setForm(nextForm);
  };

  useEffect(() => {
    if (!addOpen) return;

    const requestedSku = normalizeManualSku(form.sku);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (!requestedSku) {
        setCatalogLookup(EMPTY_CATALOG_LOOKUP);
        return;
      }

      const skuError = validateManualSku(requestedSku);
      if (skuError) {
        setCatalogLookup({
          status: 'error',
          message: skuError,
          existsInPlant: false,
        });
        setForm((current) => ({
          ...current,
          material: '',
          name: '',
          category: '',
          replacementDays: '',
          minStock: '',
          unit: 'PZA',
        }));
        return;
      }

      void (async () => {
        setCatalogLookup({
          status: 'loading',
          message: 'Consultando catálogo maestro...',
          existsInPlant: false,
        });

        try {
          const token = await requireAdminToken();
          const response = await fetch(
            `/api/inventory/items?lookupSku=${encodeURIComponent(requestedSku)}&plant=${encodeURIComponent(writePlantId)}`,
            {
              cache: 'no-store',
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              },
            }
          );
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new ApiRequestError(
              typeof result?.error === 'string' ? result.error : 'SKU no registrado en el catálogo maestro.',
              response.status
            );
          }

          const item = result?.catalogItem as {
            sku?: string;
            material?: string;
            name?: string;
            category?: string;
            replacementDays?: number;
            unit?: string;
            minStock?: number;
            source?: string;
          };
          if (!item?.sku || !item?.name || !item?.category || !item?.replacementDays) {
            throw new Error('Respuesta incompleta del catálogo maestro.');
          }

          setForm((current) => {
            if (normalizeManualSku(current.sku) !== requestedSku) return current;
            return {
              ...current,
              sku: item.sku ?? requestedSku,
              material: item.material ?? item.sku ?? requestedSku,
              name: item.name ?? '',
              category: item.category ?? '',
              replacementDays: String(item.replacementDays ?? ''),
              minStock: String(item.minStock ?? 2),
              unit: item.unit ?? 'PZA',
            };
          });

          const existsInPlant = result?.existsInPlant === true;
          setCatalogLookup({
            status: existsInPlant ? 'duplicate' : 'found',
            message: existsInPlant
              ? 'Este SKU ya existe en la planta. Usa Ajustar stock.'
              : 'SKU validado. Nombre, categoría y vigencia fueron tomados del catálogo.',
            existsInPlant,
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          setForm((current) => {
            if (normalizeManualSku(current.sku) !== requestedSku) return current;
            return {
              ...current,
              material: '',
              name: '',
              category: '',
              replacementDays: '',
              minStock: '',
              unit: 'PZA',
            };
          });
          setCatalogLookup({
            status: 'error',
            message: error instanceof Error && error.message
              ? error.message
              : 'No se pudo consultar el catálogo maestro.',
            existsInPlant: false,
          });
        }
      })();
    }, requestedSku ? 450 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [addOpen, form.sku, writePlantId]);

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
            minStock: item.minStock,
            reorderPoint: item.reorderPoint,
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
      playNotificationSound('sync_error');
      toast.error('No se pudo sincronizar el inventario desde Firebase.');
      loadLocalInventory();
    }
  }, [activePlantId, loadLocalInventory]);

  /* ── Server inventory loader ─────────────────── */
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadInventory();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadInventory]);

  /* ── Computed values ─────────────────────────── */
  const filtered = items.filter(it => {
    const itemReorderAlerts = getItemReorderAlerts(it);
    const matchSearch = it.name.toLowerCase().includes(search.toLowerCase()) ||
      it.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || it.category === filterCategory;
    const matchStock =
      filterStock === 'all' ||
      (filterStock === 'critical' && it.stock > 0 && it.stock <= LOW_STOCK_THRESHOLD) ||
      (filterStock === 'reorder' && itemReorderAlerts.length > 0) ||
      (filterStock === 'out' && it.stock === 0) ||
      (filterStock === 'other' && it.stock > LOW_STOCK_THRESHOLD && itemReorderAlerts.length === 0);
    return matchSearch && matchCat && matchStock;
  });

  const totalStock = items.reduce((sum, i) => sum + i.stock, 0);
  const lowStockItems = items.filter(i => i.stock <= LOW_STOCK_THRESHOLD && i.stock > 0);
  const outOfStock = items.filter(i => i.stock === 0);
  const reorderAlerts = items
    .flatMap(getItemReorderAlerts)
    .sort((a, b) => a.stock - b.stock || b.reorderPoint - a.reorderPoint || a.material.localeCompare(b.material, 'es'));
  const reorderAlertByDocId = reorderAlerts.reduce<Record<string, ReorderAlert[]>>((acc, alert) => {
    acc[alert.itemDocId] = [...(acc[alert.itemDocId] ?? []), alert];
    return acc;
  }, {});
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
        plantaId: item.plantaId,
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
    const invalidPlantItem = importPreview.items.find((item) => item.plantaId !== writePlantId);
    if (invalidPlantItem) {
      toast.error(
        `El archivo contiene materiales de ${plantLabel(invalidPlantItem.plantaId)} y la carga esta configurada para ${plantLabel(writePlantId)}.`
      );
      return;
    }

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
        throw new ApiRequestError(
          typeof result?.error === 'string' ? result.error : 'inventory_import_failed',
          response.status
        );
      }
      setImportOpen(false);
      resetInventoryImport();
      await loadInventory();

      toast.success(`Inventario cargado: ${result.created ?? 0} nuevos, ${result.updated ?? 0} actualizados.`);
    } catch (error) {
      console.error('[Inventory import write error]', error);
      if (canUseLocalFallback() && (!(error instanceof ApiRequestError) || error.status >= 500)) {
        const total = saveInventoryLocally(importPreview);
        toast.warning(`Sin conexión con servidor. Inventario guardado localmente con ${total} artículo(s).`);
      } else {
        toast.error(error instanceof Error && error.message ? error.message : 'No se pudo cargar el inventario en Firebase.');
      }
    } finally {
      setImportingInventory(false);
    }
  };

  /* ── Add single item ─────────────────────────── */
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (catalogLookup.status !== 'found') {
      toast.error(catalogLookup.message);
      return;
    }

    const stockInput = Number(form.stock);
    const minStockInput = form.minStock === '' ? undefined : Number(form.minStock);
    const unitCost = form.unitCost === '' ? undefined : Number(form.unitCost);
    const location = form.location.trim().toUpperCase();

    if (!Number.isInteger(stockInput) || stockInput < 0 || stockInput > 1_000_000) {
      toast.error('El stock debe ser un entero entre 0 y 1,000,000.');
      return;
    }
    if (!location) {
      toast.error('La ubicación es obligatoria.');
      return;
    }
    if (minStockInput !== undefined && (!Number.isInteger(minStockInput) || minStockInput < 0)) {
      toast.error('El stock mínimo debe ser un entero no negativo.');
      return;
    }
    if (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0)) {
      toast.error('El precio debe ser un número no negativo.');
      return;
    }

    setSaving(true);
    try {
      const token = await requireAdminToken();
      const response = await fetch('/api/inventory/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sku: normalizeManualSku(form.sku),
          stock: stockInput,
          minStock: minStockInput,
          location,
          unitCost,
          plantaId: writePlantId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ApiRequestError(
          typeof result?.error === 'string' ? result.error : 'inventory_item_save_failed',
          response.status
        );
      }

      const savedItem = result?.item as PPECatalogItem | undefined;
      if (canUseLocalFallback() && savedItem) {
        upsertLocalCatalogItem({
          ...savedItem,
          id: result?.itemId ?? result?.sku ?? savedItem.id,
        });
      }

      await loadInventory();
      toast.success(`Artículo "${savedItem?.name ?? form.name}" agregado con datos del catálogo maestro.`);
      setForm(EMPTY_ITEM_FORM);
      setCatalogLookup(EMPTY_CATALOG_LOOKUP);
      setAddOpen(false);
    } catch (error) {
      console.error('[Manual inventory item error]', error);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'No se pudo agregar el material.'
      );
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
    reorderAlerts,
    reorderAlertByDocId,
    uniqueCategories,
    plantId: writePlantId,

    // Search & filter
    search,
    setSearch,
    filterCategory,
    setFilterCategory,
    filterStock,
    setFilterStock,

    // Add dialog
    addOpen,
    setAddOpen: handleAddOpenChange,
    saving,
    form,
    setForm: handleAddFormChange,
    catalogLookup,
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
