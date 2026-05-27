import {
  doc, getDoc, collection, serverTimestamp, query, where, getDocs, limit, writeBatch,
  runTransaction, Timestamp
} from "firebase/firestore";
import { db, ensureFirebaseReady } from "./firebase";
import { KioskEmployee, KioskRequestItem, KioskRequestStatus, PPECatalogItem, ReplacementReason } from "./kiosk-types";
import {
  canUseLocalFallback,
  createLocalAssignment,
  createLocalKioskRequest,
  getLocalActiveAssignment,
  getLocalKioskEmployee,
  getLocalKioskRequestStatus,
  getLocalPPECatalog,
  isLocalKioskRequestId,
  isOfflineRuntime,
  listLocalKioskRequests,
  saveLocalKioskEmployeePin,
  updateLocalKioskRequestStatus,
} from "./kiosk-local-store";
import { calcNextReplacementDate } from "./replacement-logic";
import { legacyHashPin } from "./pin-utils";

class KioskApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "KioskApiError";
    this.status = status;
  }
}

async function parseKioskApiError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

function canFallbackToLocal(error: unknown) {
  return (
    canUseLocalFallback() ||
    isOfflineRuntime() ||
    (isLocalRuntime() && (!(error instanceof KioskApiError) || error.status >= 500))
  );
}

// ── Empleado ──────────────────────────────────────────────────────────────────

function isLocalRuntime() {
  return typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export async function getEmployeeById(employeeId: string): Promise<KioskEmployee | null> {
  try {
    await ensureFirebaseReady();
    const snap = await getDoc(doc(db, "kiosk_employees", employeeId));
    if (snap.exists()) return { id: snap.id, ...snap.data() } as KioskEmployee;
  } catch (error) {
    console.warn("[Kiosko] Usando empleado local por error de Firebase.", error);
    return getLocalKioskEmployee(employeeId, isLocalRuntime() || canUseLocalFallback());
  }
  return getLocalKioskEmployee(employeeId, isLocalRuntime() || canUseLocalFallback());
}

export async function saveEmployeePin(employeeId: string, pin: string): Promise<void> {
  try {
    const response = await fetch("/api/kiosk/pin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, pin }),
    });

    if (!response.ok) {
      throw new KioskApiError(
        await parseKioskApiError(response, "No se pudo configurar el PIN."),
        response.status
      );
    }
  } catch (error) {
    if (canFallbackToLocal(error)) {
      console.warn("[Kiosko] Guardando PIN en modo local.", error);
      saveLocalKioskEmployeePin(employeeId, legacyHashPin(pin));
      return;
    }
    throw error;
  }
}

export async function validateEmployeePin(
  employeeId: string,
  pin: string
): Promise<boolean> {
  try {
    const response = await fetch("/api/kiosk/pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, pin }),
    });

    if (response.ok) {
      const data = await response.json();
      return data?.valid === true;
    }

    throw new KioskApiError(
      await parseKioskApiError(response, "No se pudo validar el PIN."),
      response.status
    );
  } catch (error) {
    if (canFallbackToLocal(error)) {
      const emp = await getEmployeeById(employeeId);
      return !!emp?.pin && emp.pin === legacyHashPin(pin);
    }
    if (error instanceof KioskApiError && error.status === 401) return false;
    throw error;
  }
}

// ── Catálogo ──────────────────────────────────────────────────────────────────

export async function getPPECatalog(): Promise<PPECatalogItem[]> {
  try {
    await ensureFirebaseReady();
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

export async function getActiveAssignment(employeeId: string, sku: string): Promise<{ id: string } & Record<string, unknown> | null> {
  try {
    await ensureFirebaseReady();
    const q = query(
      collection(db, "assignments"),
      where("employeeId", "==", employeeId),
      where("sku", "==", sku),
      where("status", "==", "active"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return getLocalActiveAssignment(employeeId, sku);
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (error) {
    console.warn("[Kiosko] Consultando asignacion local por error de Firebase.", error);
    return getLocalActiveAssignment(employeeId, sku);
  }
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
  try {
    await ensureFirebaseReady();
    const prev = await getActiveAssignment(params.employeeId, params.sku);
    const assignmentRef = doc(collection(db, "assignments"));
    const chargeRef = params.chargeAmount && params.chargeAmount > 0
      ? doc(collection(db, "loss_charges"))
      : null;

    await runTransaction(db, async (transaction) => {
      const catalogRef = doc(db, "ppe_catalog", params.itemId);
      const kioskCatalogRef = doc(db, "kiosk_catalog", params.itemId);
      const [catalogSnap, kioskCatalogSnap] = await Promise.all([
        transaction.get(catalogRef),
        transaction.get(kioskCatalogRef),
      ]);

      if (!catalogSnap.exists()) {
        throw new Error("item_not_found");
      }

      const catalogData = catalogSnap.data() as Record<string, unknown>;
      const catalogUpdates: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      const kioskUpdates: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };

      let currentStock = 0;
      if (params.size && params.size !== "N/A") {
        const sizes = catalogData.sizes as Record<string, { stock?: unknown }> | undefined;
        const currentVariant = sizes?.[params.size];
        currentStock = Number(currentVariant?.stock ?? 0);

        if (!Number.isFinite(currentStock) || currentStock <= 0) {
          throw new Error("out_of_stock");
        }

        const nextStock = currentStock - 1;
        catalogUpdates[`sizes.${params.size}.stock`] = nextStock;
        catalogUpdates[`sizes.${params.size}.available`] = nextStock > 0;
        kioskUpdates[`sizes.${params.size}.stock`] = nextStock;
        kioskUpdates[`sizes.${params.size}.available`] = nextStock > 0;

        if (typeof catalogData.stock === "number") {
          const aggregateStock = Math.max(0, catalogData.stock - 1);
          catalogUpdates.stock = aggregateStock;
          kioskUpdates.stock = aggregateStock;
          kioskUpdates.available = aggregateStock > 0;
        }
      } else {
        currentStock = Number(catalogData.stock ?? 0);
        if (!Number.isFinite(currentStock) || currentStock <= 0) {
          throw new Error("out_of_stock");
        }

        const nextStock = currentStock - 1;
        catalogUpdates.stock = nextStock;
        kioskUpdates.stock = nextStock;
        kioskUpdates.available = nextStock > 0;
      }

      transaction.set(assignmentRef, {
        employeeId: params.employeeId,
        sku: params.sku,
        size: params.size || "N/A",
        assignedAt: serverTimestamp(),
        nextReplacementAt: Timestamp.fromDate(nextReplacement),
        status: "active",
        replacementReason: params.reason,
        chargeAmount: params.chargeAmount ?? 0,
        chargeApproved: params.chargeAmount ? false : true,
        signatureDataUrl: params.signatureDataUrl ?? null,
        issuedByKiosk: params.issuedByKiosk,
        issuedByUserId: "kiosk",
      });

      transaction.update(catalogRef, catalogUpdates);

      if (kioskCatalogSnap.exists()) {
        transaction.update(kioskCatalogRef, kioskUpdates);
      }

      if (prev && prev.id !== assignmentRef.id) {
        transaction.update(doc(db, "assignments", prev.id), {
          status: "replaced",
          updatedAt: serverTimestamp(),
        });
      }

      if (chargeRef) {
        transaction.set(chargeRef, {
          assignmentId: assignmentRef.id,
          employeeId: params.employeeId,
          sku: params.sku,
          chargeAmount: params.chargeAmount,
          signatureDataUrl: params.signatureDataUrl ?? null,
          createdAt: serverTimestamp(),
          status: "pending_payroll",
        });
      }
    });

    return assignmentRef.id;
  } catch (error) {
    if (!canFallbackToLocal(error)) throw error;
    console.warn("[Kiosko] Dispensando EPP en modo local.", error);
    return createLocalAssignment({
      employeeId: params.employeeId,
      sku: params.sku,
      size: params.size || "N/A",
      itemId: params.itemId,
      replacementDays: params.replacementDays,
      replacementReason: params.reason,
      chargeAmount: params.chargeAmount ?? 0,
      signatureDataUrl: params.signatureDataUrl ?? null,
      issuedByKiosk: params.issuedByKiosk,
      issuedByUserId: "kiosk",
    });
  }
}

// ── Solicitudes de kiosko ─────────────────────────────────────────────────────

export async function createKioskRequest(input: {
  employeeId: string;
  employeeName: string;
  items: KioskRequestItem[];
}): Promise<string> {
  try {
    await ensureFirebaseReady();
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
    await ensureFirebaseReady();
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
    await ensureFirebaseReady();
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

  await ensureFirebaseReady();
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
