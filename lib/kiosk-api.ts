import {
  doc, getDoc, updateDoc, addDoc, collection,
  serverTimestamp, increment, query, where, getDocs, limit, writeBatch
} from "firebase/firestore";
import { db } from "./firebase";
import { KioskEmployee, KioskRequestItem, KioskRequestStatus, PPECatalogItem, ReplacementReason } from "./kiosk-types";
import {
  createLocalKioskRequest,
  getLocalKioskEmployee,
  getLocalKioskRequestStatus,
  getLocalPPECatalog,
  isLocalKioskRequestId,
  listLocalKioskRequests,
  saveLocalKioskEmployeePin,
  updateLocalKioskRequestStatus,
} from "./kiosk-local-store";
import { calcNextReplacementDate } from "./replacement-logic";

// ── Empleado ──────────────────────────────────────────────────────────────────

function isLocalRuntime() {
  return typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export async function getEmployeeById(employeeId: string): Promise<KioskEmployee | null> {
  try {
    const snap = await getDoc(doc(db, "kiosk_employees", employeeId));
    if (snap.exists()) return { id: snap.id, ...snap.data() } as KioskEmployee;
  } catch (error) {
    console.warn("[Kiosko] Usando empleado local por error de Firebase.", error);
    return getLocalKioskEmployee(employeeId, true);
  }
  return getLocalKioskEmployee(employeeId, isLocalRuntime());
}

export async function saveEmployeePin(employeeId: string, pinHash: string): Promise<void> {
  try {
    await updateDoc(doc(db, "kiosk_employees", employeeId), {
      pin: pinHash,
      firstLogin: false,
      termsAccepted: true,
      termsAcceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("[Kiosko] Guardando PIN en modo local.", error);
    saveLocalKioskEmployeePin(employeeId, pinHash);
  }
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
  try {
    const snap = await getDocs(query(collection(db, "kiosk_catalog"), where("active", "==", true)));
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as PPECatalogItem))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    return items.length > 0 ? items : getLocalPPECatalog();
  } catch (error) {
    console.warn("[Kiosko] Usando catalogo local por error de Firebase.", error);
    return getLocalPPECatalog();
  }
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
  try {
    const ref = doc(collection(db, "kiosk_requests"));
    const batch = writeBatch(db);

    batch.set(ref, {
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      items: input.items,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: "kiosk",
    });

    batch.set(doc(db, "kiosk_request_status", ref.id), {
      requestId: ref.id,
      status: "pending",
      source: "kiosk",
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return ref.id;
  } catch (error) {
    console.warn("[Kiosko] Creando solicitud en modo local.", error);
    return createLocalKioskRequest(input);
  }
}

export async function getKioskRequestStatus(requestId: string): Promise<KioskRequestStatus> {
  if (isLocalKioskRequestId(requestId)) {
    const localStatus = getLocalKioskRequestStatus(requestId);
    if (!localStatus) throw new Error("kiosk_request_not_found");
    return localStatus;
  }

  try {
    const snap = await getDoc(doc(db, "kiosk_request_status", requestId));
    if (!snap.exists()) throw new Error("kiosk_request_not_found");

    const status = snap.data().status;
    if (status === "approved" || status === "rejected" || status === "pending") {
      return status;
    }
  } catch (error) {
    const localStatus = getLocalKioskRequestStatus(requestId);
    if (localStatus) return localStatus;
    throw error;
  }
  throw new Error("kiosk_request_invalid_status");
}

export interface AdminKioskRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  items: KioskRequestItem[];
  status: KioskRequestStatus;
  createdAt?: Date;
}

export async function listAdminKioskRequests(status: KioskRequestStatus = "pending", max = 25): Promise<AdminKioskRequest[]> {
  const localRequests = listLocalKioskRequests(status, max);

  try {
    const snap = await getDocs(
      query(
        collection(db, "kiosk_requests"),
        where("status", "==", status),
        limit(Math.max(1, Math.min(max, 50)))
      )
    );

    const remoteRequests = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        employeeId: data.employeeId ?? "",
        employeeName: data.employeeName ?? "",
        items: Array.isArray(data.items) ? (data.items as KioskRequestItem[]) : [],
        status: data.status as KioskRequestStatus,
        createdAt: data.createdAt?.toDate?.(),
      };
    });

    return [...localRequests, ...remoteRequests]
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, Math.max(1, Math.min(max, 50)));
  } catch (error) {
    console.warn("[Kiosko] Listando solicitudes locales por error de Firebase.", error);
    return localRequests;
  }
}

export async function updateKioskRequestStatus(requestId: string, status: Extract<KioskRequestStatus, "approved" | "rejected">): Promise<void> {
  if (isLocalKioskRequestId(requestId)) {
    updateLocalKioskRequestStatus(requestId, status);
    return;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, "kiosk_requests", requestId), {
    status,
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(db, "kiosk_request_status", requestId),
    {
      requestId,
      status,
      source: "kiosk",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
}
