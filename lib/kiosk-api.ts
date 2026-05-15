import {
  doc, getDoc, updateDoc, addDoc, collection,
  serverTimestamp, increment, query, where, getDocs, limit
} from "firebase/firestore";
import { db } from "./firebase";
import { KioskEmployee, KioskRequestItem, KioskRequestStatus, PPECatalogItem, ReplacementReason } from "./kiosk-types";
import { calcNextReplacementDate } from "./replacement-logic";

// ── Empleado ──────────────────────────────────────────────────────────────────

export async function getEmployeeById(employeeId: string): Promise<KioskEmployee | null> {
  const snap = await getDoc(doc(db, "employees", employeeId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as KioskEmployee;
}

export async function saveEmployeePin(employeeId: string, pinHash: string): Promise<void> {
  await updateDoc(doc(db, "employees", employeeId), {
    pin: pinHash,
    firstLogin: false,
    termsAccepted: true,
    termsAcceptedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

export async function validateEmployeePin(
  employeeId: string,
  candidateHash: string
): Promise<boolean> {
  const emp = await getEmployeeById(employeeId);
  if (!emp || !emp.pin) return false;
  return emp.pin === candidateHash;  // en prod usar bcrypt.compare en API Route
}

// ── Catálogo ──────────────────────────────────────────────────────────────────

export async function getPPECatalog(): Promise<PPECatalogItem[]> {
  const snap = await getDocs(collection(db, "ppe_catalog"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PPECatalogItem));
}

// ── Asignaciones activas del empleado ─────────────────────────────────────────

export async function getActiveAssignment(employeeId: string, sku: string) {
  const q = query(
    collection(db, "assignments"),
    where("employeeId", "==", employeeId),
    where("sku", "==", sku),
    where("status", "==", "active"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// ── Dispensar EPP ─────────────────────────────────────────────────────────────

export interface DispenseParams {
  employeeId: string;
  sku: string;
  size: string;
  itemId: string;          // doc ID en ppe_catalog
  replacementDays: number;
  reason: ReplacementReason;
  chargeAmount?: number;
  signatureDataUrl?: string;
  issuedByKiosk: boolean;
}

export async function dispenseEPP(params: DispenseParams): Promise<string> {
  const nextReplacement = calcNextReplacementDate(params.replacementDays);

  // 1. Crear assignment
  const ref = await addDoc(collection(db, "assignments"), {
    employeeId: params.employeeId,
    sku: params.sku,
    size: params.size,
    assignedAt: serverTimestamp(),
    nextReplacementAt: nextReplacement,
    status: params.reason === "desgaste" ? "pending_review" : "active",
    replacementReason: params.reason,
    chargeAmount: params.chargeAmount ?? 0,
    chargeApproved: params.chargeAmount ? false : true,
    signatureDataUrl: params.signatureDataUrl ?? null,
    issuedByKiosk: params.issuedByKiosk,
    issuedByUserId: "kiosk",
  });

  // 2. Bajar stock del SKU/talla
  const catalogRef = doc(db, "ppe_catalog", params.itemId);
  if (params.size && params.size !== "N/A") {
    await updateDoc(catalogRef, {
      [`sizes.${params.size}.stock`]: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(catalogRef, {
      stock: increment(-1),
      updatedAt: serverTimestamp(),
    });
  }

  // 3. Si había asignación activa anterior, marcarla como "replaced"
  const prev = await getActiveAssignment(params.employeeId, params.sku);
  if (prev && (prev as any).id !== ref.id) {
    await updateDoc(doc(db, "assignments", (prev as any).id), {
      status: "replaced",
      updatedAt: serverTimestamp(),
    });
  }

  // 4. Registrar cobro si hay extravío
  if (params.chargeAmount && params.chargeAmount > 0) {
    await addDoc(collection(db, "loss_charges"), {
      assignmentId: ref.id,
      employeeId: params.employeeId,
      sku: params.sku,
      chargeAmount: params.chargeAmount,
      signatureDataUrl: params.signatureDataUrl ?? null,
      createdAt: serverTimestamp(),
      status: "pending_payroll",
    });
  }

  return ref.id;
}

// ── Solicitudes de kiosko ─────────────────────────────────────────────────────

export async function createKioskRequest(input: {
  employeeId: string;
  employeeName: string;
  items: KioskRequestItem[];
}): Promise<string> {
  const ref = await addDoc(collection(db, "kiosk_requests"), {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    items: input.items,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "kiosk",
  });

  return ref.id;
}

export async function getKioskRequestStatus(requestId: string): Promise<KioskRequestStatus> {
  const snap = await getDoc(doc(db, "kiosk_requests", requestId));
  if (!snap.exists()) throw new Error("kiosk_request_not_found");

  const status = snap.data().status;
  if (status === "approved" || status === "rejected" || status === "pending") {
    return status;
  }
  throw new Error("kiosk_request_invalid_status");
}
