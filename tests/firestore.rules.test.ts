import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "demo-control-epp-rules";

let testEnv: RulesTestEnvironment;

const globalAdminProfile = {
  uid: "global-admin",
  email: "global-admin@example.invalid",
  role: "admin_global",
  plantaId: "nacional",
  active: true,
};

const localAdminProfile = {
  uid: "local-cua",
  email: "local-cua@example.invalid",
  role: "admin_local",
  plantaId: "cuautitlan",
  active: true,
};

async function seedRulesFixtures() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", globalAdminProfile.uid), globalAdminProfile),
      setDoc(doc(db, "users", localAdminProfile.uid), localAdminProfile),
      setDoc(doc(db, "users", "ordinary-user"), {
        uid: "ordinary-user",
        email: "ordinary@example.invalid",
        role: "employee",
        plantaId: "cuautitlan",
        active: true,
      }),
      setDoc(doc(db, "employees", "employee-cua"), {
        id: "employee-cua",
        name: "Empleado Cuautitlan",
        area: "Demo",
        active: true,
        plantaId: "cuautitlan",
      }),
      setDoc(doc(db, "employees", "employee-tol"), {
        id: "employee-tol",
        name: "Empleado Toluca",
        area: "Demo",
        active: true,
        plantaId: "toluca",
      }),
      setDoc(doc(db, "ppe_catalog", "item-cua"), {
        name: "Casco Cuautitlan",
        plantaId: "cuautitlan",
        stock: 10,
      }),
      setDoc(doc(db, "ppe_catalog", "item-tol"), {
        name: "Casco Toluca",
        plantaId: "toluca",
        stock: 10,
      }),
      setDoc(doc(db, "kiosk_catalog", "public-cua"), {
        name: "Casco Demo",
        category: "Cascos",
        available: true,
        plantaId: "cuautitlan",
      }),
      setDoc(doc(db, "audit_events", "event-1"), {
        eventType: "DEMO_EVENT",
        plantaId: "cuautitlan",
      }),
    ]);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedRulesFixtures();
});

after(async () => {
  await testEnv.cleanup();
});

describe("Firestore deny-by-default", () => {
  it("deniega empleados y catalogo privado a clientes anonimos", async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "employees", "employee-cua")));
    await assertFails(getDoc(doc(db, "ppe_catalog", "item-cua")));
  });

  it("deniega colecciones privadas a un usuario sin rol administrativo", async () => {
    const db = testEnv.authenticatedContext("ordinary-user").firestore();

    await assertFails(getDoc(doc(db, "employees", "employee-cua")));
    await assertFails(getDoc(doc(db, "inventory_movements", "movement-1")));
  });

  it("permite al administrador local leer solo su planta", async () => {
    const db = testEnv.authenticatedContext(localAdminProfile.uid).firestore();

    await assertSucceeds(getDoc(doc(db, "employees", "employee-cua")));
    await assertFails(getDoc(doc(db, "employees", "employee-tol")));
    await assertSucceeds(getDoc(doc(db, "ppe_catalog", "item-cua")));
    await assertFails(getDoc(doc(db, "ppe_catalog", "item-tol")));
  });

  it("exige que las consultas del administrador local esten acotadas por planta", async () => {
    const db = testEnv.authenticatedContext(localAdminProfile.uid).firestore();

    const ownPlant = query(collection(db, "employees"), where("plantaId", "==", "cuautitlan"));
    const allPlants = collection(db, "employees");

    const ownSnapshot = await assertSucceeds(getDocs(ownPlant));
    assert.equal(ownSnapshot.size, 1);
    await assertFails(getDocs(allPlants));
  });

  it("permite al administrador global consultar todas las plantas", async () => {
    const db = testEnv.authenticatedContext(globalAdminProfile.uid).firestore();

    const snapshot = await assertSucceeds(getDocs(collection(db, "employees")));
    assert.equal(snapshot.size, 2);
  });

  it("impide autoescalacion de rol", async () => {
    const ordinaryDb = testEnv.authenticatedContext("ordinary-user").firestore();
    const localAdminDb = testEnv.authenticatedContext(localAdminProfile.uid).firestore();

    await assertFails(updateDoc(doc(ordinaryDb, "users", "ordinary-user"), { role: "admin_global" }));
    await assertFails(updateDoc(doc(localAdminDb, "users", localAdminProfile.uid), { role: "admin_global" }));
  });

  it("impide escrituras directas de movimientos incluso al administrador global", async () => {
    const db = testEnv.authenticatedContext(globalAdminProfile.uid).firestore();

    await assertFails(setDoc(doc(db, "inventory_movements", "movement-1"), {
      itemId: "item-cua",
      plantaId: "cuautitlan",
      delta: -1,
    }));
  });

  it("permite al backend escribir sin reglas y conserva el bloqueo del cliente", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await assertSucceeds(setDoc(doc(context.firestore(), "inventory_movements", "server-movement"), {
        itemId: "item-cua",
        plantaId: "cuautitlan",
        delta: -1,
      }));
    });

    const clientDb = testEnv.authenticatedContext(globalAdminProfile.uid).firestore();
    const snapshot = await assertSucceeds(getDoc(doc(clientDb, "inventory_movements", "server-movement")));
    assert.equal(snapshot.exists(), true);
    await assertFails(updateDoc(doc(clientDb, "inventory_movements", "server-movement"), { delta: -2 }));
  });

  it("bloquea el acceso directo al catalogo de kiosko", async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "kiosk_catalog", "public-cua")));
    await assertFails(updateDoc(doc(db, "kiosk_catalog", "public-cua"), { available: false }));
  });

  it("restringe la auditoria al administrador global", async () => {
    const globalDb = testEnv.authenticatedContext(globalAdminProfile.uid).firestore();
    const localDb = testEnv.authenticatedContext(localAdminProfile.uid).firestore();

    await assertSucceeds(getDoc(doc(globalDb, "audit_events", "event-1")));
    await assertFails(getDoc(doc(localDb, "audit_events", "event-1")));
  });
});
