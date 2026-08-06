type CatalogRecord = Record<string, unknown>;

export type PublicCatalogOptions = {
  available?: boolean;
  sizeAvailability?: Record<string, boolean>;
};

function isRecord(value: unknown): value is CatalogRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isAvailable(data: CatalogRecord) {
  return data.available === true || (typeof data.stock === "number" && data.stock > 0);
}

function cleanUndefined(input: CatalogRecord) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function buildPublicSizes(source: unknown, overrides: Record<string, boolean> | undefined) {
  if (!isRecord(source)) return undefined;

  const sizes = Object.fromEntries(
    Object.entries(source).flatMap(([size, rawVariant]) => {
      if (!isRecord(rawVariant)) return [];
      const sku = optionalText(rawVariant.sku);
      if (!sku) return [];

      return [[
        size,
        {
          sku,
          available: overrides?.[size] ?? isAvailable(rawVariant),
        },
      ]];
    })
  );

  return Object.keys(sizes).length > 0 ? sizes : undefined;
}

/**
 * Creates the only catalog shape that may cross the kiosk trust boundary.
 * Exact stock, costs, SAP materials, storage locations and package metadata
 * are deliberately omitted.
 */
export function buildPublicKioskCatalogPayload(
  source: CatalogRecord,
  options: PublicCatalogOptions = {}
) {
  const sizes = buildPublicSizes(source.sizes, options.sizeAvailability);
  const available = options.available ?? (
    sizes
      ? Object.values(sizes).some((variant) => variant.available)
      : isAvailable(source)
  );

  return cleanUndefined({
    sku: optionalText(source.sku),
    name: optionalText(source.name),
    category: optionalText(source.category),
    replacementDays: optionalPositiveNumber(source.replacementDays),
    durationRuleId: optionalText(source.durationRuleId),
    durationRuleSource: optionalText(source.durationRuleSource),
    durationRuleSku: optionalText(source.durationRuleSku),
    requiredQuantity: optionalPositiveNumber(source.requiredQuantity),
    requiredUnit: optionalText(source.requiredUnit),
    hasSizes: source.hasSizes === true || Boolean(sizes),
    sizes,
    active: source.active !== false,
    available,
    imageUrl: optionalText(source.imageUrl),
    plantaId: optionalText(source.plantaId),
    demoData: source.demoData === true ? true : undefined,
    schemaVersion: typeof source.schemaVersion === "number" ? source.schemaVersion : undefined,
  });
}
