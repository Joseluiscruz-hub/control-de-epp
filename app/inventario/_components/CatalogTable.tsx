"use client";

import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { type PpeItem, LOW_STOCK_THRESHOLD, stockColor } from '../_hooks/useInventoryData';
import { useEffect, useRef } from 'react';

export interface CatalogTableProps {
  filtered: PpeItem[];
  search: string;
  setSearch: (v: string) => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  uniqueCategories: string[];
  onAdjust: (item: PpeItem) => void;
}

export function CatalogTable({
  filtered,
  search,
  setSearch,
  filterCategory,
  setFilterCategory,
  uniqueCategories,
  onAdjust,
}: CatalogTableProps) {
  const pagination = usePagination(filtered, 20);
  const formatPackageEquivalent = (stock: number, unitsPerPackage: number) => (
    (stock / unitsPerPackage).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  );

  // Reset to page 1 when filters change
  const prevSearch = useRef(search);
  const prevCategory = useRef(filterCategory);
  useEffect(() => {
    if (prevSearch.current !== search || prevCategory.current !== filterCategory) {
      pagination.setPage(1);
      prevSearch.current = search;
      prevCategory.current = filterCategory;
    }
  }, [search, filterCategory, pagination]);

  return (
    <div className="enterprise-panel">
      {/* Search / filter bar */}
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

      {/* Table */}
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
              {pagination.paginatedItems.map((item, idx) => (
                <motion.tr 
                  layout
                  key={item.docId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(idx, 10) * 0.03 }}
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
                        {item.stock} <span className="opacity-60">PZA</span>
                      </div>
                      {item.unitsPerPackage && item.packageUnit && (
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/45">
                          {`${item.stock} PZA / ${formatPackageEquivalent(item.stock, item.unitsPerPackage)} ${item.packageUnit}`}
                        </p>
                      )}
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
                      onClick={() => onAdjust(item)}
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

      {/* Pagination */}
      <div className="px-5 pb-4">
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          itemsPerPage={pagination.itemsPerPage}
          hasNext={pagination.hasNext}
          hasPrev={pagination.hasPrev}
          onNext={pagination.next}
          onPrev={pagination.prev}
          onSetPage={pagination.setPage}
          onSetItemsPerPage={pagination.setItemsPerPage}
          itemLabel="registros"
        />
      </div>
    </div>
  );
}
