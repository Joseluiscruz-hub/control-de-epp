import type { KioskRequestItem, ReplacementReason } from "./kiosk-types";

export const VALID_KIOSK_REPLACEMENT_REASONS = new Set<ReplacementReason>([
  "vida_util",
  "desgaste",
  "extravio",
]);

const REQUEST_ITEM_KEYS = new Set([
  "itemId",
  "itemName",
  "sku",
  "size",
  "replacementDays",
  "replacementReason",
  "durationRuleId",
  "durationRuleSource",
  "durationRuleSku",
  "durationRuleSapMaterial",
  "requiredQuantity",
  "requiredUnit",
  "chargeAmount",
  "signatureDataUrl",
  "earlyReplacementAlert",
]);

export class KioskRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "KioskRequestError";
    this.status = status;
  }
}

export type RequestItemInput = Partial<KioskRequestItem>;

export type FulfillableKioskItem = KioskRequestItem & {
  chargeAmount?: number;
  signatureDataUrl?: string | null;
};

export function readKioskText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function readKioskNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidRequestItemShape(value: unknown): value is RequestItemInput {
  if (!isObject(value)) return false;
  if (Object.keys(value).some((key) => !REQUEST_ITEM_KEYS.has(key))) return false;

  const itemId = readKioskText(value.itemId);
  if (!itemId) return false;

  const replacementReason = readKioskText(value.replacementReason);
  if (
    replacementReason &&
    !VALID_KIOSK_REPLACEMENT_REASONS.has(replacementReason as ReplacementReason)
  ) {
    return false;
  }

  if (
    value.replacementDays != null &&
    (!Number.isFinite(Number(value.replacementDays)) || Number(value.replacementDays) <= 0)
  ) {
    return false;
  }

  if (
    value.chargeAmount != null &&
    (!Number.isFinite(Number(value.chargeAmount)) || Number(value.chargeAmount) < 0)
  ) {
    return false;
  }

  return value.signatureDataUrl == null || typeof value.signatureDataUrl === "string";
}

function requestItemKey(item: Pick<RequestItemInput, "itemId" | "size">) {
  const itemId = readKioskText(item.itemId);
  const size = readKioskText(item.size) || "N/A";
  return `${itemId}\u0000${size}`;
}

export function assertUniqueRequestItems(
  items: readonly Pick<RequestItemInput, "itemId" | "size">[],
  status = 400
) {
  const seen = new Set<string>();

  items.forEach((item) => {
    const key = requestItemKey(item);
    if (seen.has(key)) {
      throw new KioskRequestError(
        "No se puede solicitar el mismo EPP y talla mas de una vez.",
        status
      );
    }
    seen.add(key);
  });
}

function parseFulfillableItem(raw: unknown, index: number): FulfillableKioskItem {
  if (!isObject(raw)) {
    throw new KioskRequestError(
      `La solicitud contiene un articulo invalido en la posicion ${index + 1}.`,
      409
    );
  }

  const itemId = readKioskText(raw.itemId);
  const itemName = readKioskText(raw.itemName);
  const sku = readKioskText(raw.sku);
  const size = readKioskText(raw.size) || "N/A";
  const replacementDays = readKioskNumber(raw.replacementDays);
  const replacementReason = readKioskText(raw.replacementReason);

  if (!itemId || !itemName || !sku || replacementDays <= 0) {
    throw new KioskRequestError(
      `La solicitud contiene un articulo incompleto en la posicion ${index + 1}.`,
      409
    );
  }

  return {
    itemId,
    itemName,
    sku,
    size,
    replacementDays,
    requiredQuantity: readKioskNumber(raw.requiredQuantity, 1),
    requiredUnit: readKioskText(raw.requiredUnit),
    unitCost: Math.max(0, readKioskNumber(raw.unitCost)),
    category: readKioskText(raw.category) || "Sin categoria",
    ...(VALID_KIOSK_REPLACEMENT_REASONS.has(replacementReason as ReplacementReason)
      ? { replacementReason: replacementReason as ReplacementReason }
      : {}),
    ...(readKioskNumber(raw.chargeAmount) > 0
      ? { chargeAmount: readKioskNumber(raw.chargeAmount) }
      : {}),
    ...(typeof raw.signatureDataUrl === "string"
      ? { signatureDataUrl: raw.signatureDataUrl }
      : {}),
    ...(readKioskText(raw.durationRuleId)
      ? { durationRuleId: readKioskText(raw.durationRuleId) }
      : {}),
    ...(readKioskText(raw.durationRuleSource)
      ? { durationRuleSource: readKioskText(raw.durationRuleSource) }
      : {}),
    ...(readKioskText(raw.durationRuleSku)
      ? { durationRuleSku: readKioskText(raw.durationRuleSku) }
      : {}),
    ...(raw.durationRuleSapMaterial === null
      ? { durationRuleSapMaterial: null }
      : readKioskText(raw.durationRuleSapMaterial)
        ? { durationRuleSapMaterial: readKioskText(raw.durationRuleSapMaterial) }
        : {}),
  };
}

export function normalizeFulfillableItems(input: unknown): FulfillableKioskItem[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new KioskRequestError(
      "Solicitud de kiosko incompleta para sincronizar consumo.",
      409
    );
  }

  const items = input.map(parseFulfillableItem);
  assertUniqueRequestItems(items, 409);
  return items;
}
