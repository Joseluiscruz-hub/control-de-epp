import { differenceInDays } from "date-fns";

export type ReplacementReason = "vida_util" | "desgaste" | "extravio";

export interface ReplacementEvaluation {
  daysUsed: number;
  daysRemaining: number;
  lifeUsedPct: number;           // 0-100
  isEligibleFree: boolean;       // vida útil cumplida → gratis
  requiresEvidence: boolean;     // reservado para flujos que pidan evidencia
  chargeAmount: number;          // extravío → cobro proporcional
  chargeDescription: string;
}

/**
 * Evalúa el estado de un EPP asignado y calcula el cobro si aplica.
 * @param assignedAt    Fecha de entrega original
 * @param replacementDays  Días de vida útil del EPP
 * @param unitCost      Costo unitario del EPP en MXN
 * @param reason        Motivo de la solicitud de reposición
 */
export function evaluateReplacement(
  assignedAt: Date,
  replacementDays: number,
  unitCost: number,
  reason: ReplacementReason
): ReplacementEvaluation {
  const today = new Date();
  const daysUsed = Math.max(0, differenceInDays(today, assignedAt));
  const daysRemaining = Math.max(0, replacementDays - daysUsed);
  const lifeUsedPct = Math.min(100, Math.round((daysUsed / replacementDays) * 100));
  const isEligibleFree = daysUsed >= replacementDays;

  let chargeAmount = 0;
  let chargeDescription = "";

  if (reason === "extravio") {
    if (!isEligibleFree) {
      // Cobro proporcional a los días restantes de vida útil
      const remainingRatio = daysRemaining / replacementDays;
      chargeAmount = parseFloat((unitCost * remainingRatio).toFixed(2));
      chargeDescription =
        `${daysRemaining} días restantes de vida útil (${Math.round(remainingRatio * 100)}% del costo $${unitCost.toFixed(2)} MXN)`;
    }
    // Si ya cumplió su vida útil y lo pierde → no se cobra
  }

  return {
    daysUsed,
    daysRemaining,
    lifeUsedPct,
    isEligibleFree,
    requiresEvidence: false,
    chargeAmount,
    chargeDescription,
  };
}

/**
 * Determina si el stock de una talla/SKU está en estado crítico.
 */
export function getStockStatus(stock: number, minStock: number): "ok" | "low" | "empty" {
  if (stock === 0) return "empty";
  if (stock <= minStock) return "low";
  return "ok";
}

/**
 * Calcula la fecha estimada de próxima reposición a partir de hoy.
 */
export function calcNextReplacementDate(replacementDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + replacementDays);
  return d;
}
