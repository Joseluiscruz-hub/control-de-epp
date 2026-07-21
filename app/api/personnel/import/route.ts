import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";
import {
  buildEmployeeImportPayload,
  buildKioskEmployeeImportPayload,
  type PersonnelRecord,
} from "@/lib/personnel-import";
import { normalizePlantId } from "@/lib/plants";
import {
  EMPLOYEE_COST_CENTERS,
  isEmployeeCostCenter,
  normalizeEmployeeCostCenter,
} from "@/lib/employee-cost-centers";

export const runtime = "nodejs";

const MAX_RECORDS_PER_IMPORT = 5000;

const STRING_FIELDS: Array<keyof Omit<PersonnelRecord, "sourceRow">> = [
  "id",
  "name",
  "area",
  "hireDate",
  "division",
  "positionId",
  "position",
  "personnelArea",
  "plantArea",
  "costCenter",
  "jobFunction",
  "sex",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePersonnelRecords(input: unknown): PersonnelRecord[] {
  if (!Array.isArray(input)) {
    throw new AuthHttpError("Lista de colaboradores requerida.", 400);
  }

  if (input.length === 0 || input.length > MAX_RECORDS_PER_IMPORT) {
    throw new AuthHttpError(`La carga debe incluir entre 1 y ${MAX_RECORDS_PER_IMPORT} colaboradores.`, 400);
  }

  return input.map((raw, index) => {
    if (!isObject(raw)) {
      throw new AuthHttpError(`Registro ${index + 1} invalido.`, 400);
    }

    const record = Object.fromEntries(
      STRING_FIELDS.map((field) => [field, typeof raw[field] === "string" ? raw[field] : ""])
    ) as Omit<PersonnelRecord, "sourceRow">;

    record.id = record.id.trim();
    record.name = record.name.trim();
    record.area = record.area.trim() || record.plantArea.trim() || record.personnelArea.trim() || "SIN AREA";
    record.costCenter = normalizeEmployeeCostCenter(record.costCenter);

    if (!record.id || !/^\d+$/.test(record.id)) {
      throw new AuthHttpError(`Registro ${index + 1}: numero de personal invalido.`, 400);
    }

    if (!record.name) {
      throw new AuthHttpError(`Registro ${index + 1}: falta nombre del colaborador.`, 400);
    }

    return {
      ...record,
      sourceRow: typeof raw.sourceRow === "number" ? raw.sourceRow : index + 2,
    };
  });
}

async function readExistingIds(collectionName: "employees" | "kiosk_employees", ids: string[]) {
  const db = getAdminDb();
  const existing = new Set<string>();

  for (let index = 0; index < ids.length; index += 250) {
    const chunk = ids.slice(index, index + 250);
    const snapshots = await Promise.all(chunk.map((id) => db.collection(collectionName).doc(id).get()));
    snapshots.forEach((snapshot, offset) => {
      if (snapshot.exists) existing.add(chunk[offset]);
    });
  }

  return existing;
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const body = await req.json();
    const records = parsePersonnelRecords(body?.records);
    const manualEntry = body?.manualEntry === true;
    if (manualEntry) {
      const invalidRecordIndex = records.findIndex((record) => !isEmployeeCostCenter(record.costCenter));
      if (invalidRecordIndex >= 0) {
        throw new AuthHttpError(
          `Registro ${invalidRecordIndex + 1}: selecciona un centro de costos válido (${EMPLOYEE_COST_CENTERS.join(", ")}).`,
          400
        );
      }
    }
    const plantaId = adminUser.plantaId === "nacional"
      ? normalizePlantId(body?.plantaId)
      : normalizePlantId(adminUser.plantaId);
    const employeeIds = records.map((record) => record.id);
    const db = getAdminDb();

    const [existingEmployees, existingKioskEmployees] = await Promise.all([
      readExistingIds("employees", employeeIds),
      readExistingIds("kiosk_employees", employeeIds),
    ]);

    let batch = db.batch();
    let writes = 0;
    let createdEmployees = 0;
    let updatedEmployees = 0;

    const commitIfNeeded = async (force = false) => {
      if (writes === 0 || (!force && writes < 440)) return;
      await batch.commit();
      batch = db.batch();
      writes = 0;
    };

    for (const record of records) {
      const employeeExists = existingEmployees.has(record.id);
      const kioskEmployeeExists = existingKioskEmployees.has(record.id);
      const employeePayload = buildEmployeeImportPayload(record);
      const kioskPayload = buildKioskEmployeeImportPayload(record);

      batch.set(
        db.collection("employees").doc(record.id),
        {
          ...employeePayload,
          plantaId,
          ...(employeeExists ? {} : { firstLogin: true, termsAccepted: false, createdAt: FieldValue.serverTimestamp() }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      batch.set(
        db.collection("kiosk_employees").doc(record.id),
        {
          ...kioskPayload,
          plantaId,
          ...(kioskEmployeeExists ? {} : { firstLogin: true, termsAccepted: false }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (employeeExists) updatedEmployees++;
      else createdEmployees++;

      writes += 2;
      await commitIfNeeded();
    }

    batch.set(
      db.collection("audit_events").doc(),
      buildAuditEvent({
        type: "personnel.import",
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        targetCollection: "employees",
        targetId: plantaId,
        metadata: {
          plantaId,
          createdEmployees,
          updatedEmployees,
          kioskEmployees: records.length,
        },
      }, req)
    );
    writes++;
    await commitIfNeeded(true);

    return Response.json({
      success: true,
      importedBy: adminUser.email,
      plantaId,
      createdEmployees,
      updatedEmployees,
      kioskEmployees: records.length,
    });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Personnel import API error]", error);
    return Response.json(
      { error: "No se pudo cargar la base de colaboradores desde el servidor." },
      { status: 500 }
    );
  }
}
