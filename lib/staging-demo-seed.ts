export type StagingDemoDocument = {
  collection: string;
  id: string;
  data: Record<string, unknown>;
};

export type StagingDemoTarget = {
  projectId: string;
  databaseId: string;
  confirmation: string;
};

type DemoPlant = "cuautitlan" | "toluca";

type DemoEmployee = {
  id: string;
  name: string;
  area: string;
  plant: DemoPlant;
  active: boolean;
  costCenter: string;
  position: string;
};

type DemoCatalogItem = {
  sku: string;
  material: string;
  name: string;
  category: string;
  replacementDays: number;
  initialStock: number;
  minStock: number;
  unitCost: number;
  durationRuleId?: string;
  requiredQuantity?: number;
  requiredUnit?: string;
  packageUnit?: "CAJA";
  unitsPerPackage?: number;
  packageRuleId?: string;
};

const DEMO_SOURCE = "staging_demo_seed_v1";

const DEMO_EMPLOYEES: readonly DemoEmployee[] = [
  {
    id: "90000001",
    name: "Ana Demostracion",
    area: "SEGURIDAD INDUSTRIAL DEMO",
    plant: "cuautitlan",
    active: true,
    costCenter: "DEMO-CUA-001",
    position: "TECNICA DE SEGURIDAD DEMO",
  },
  {
    id: "90000002",
    name: "Bruno Demostracion",
    area: "OPERACIONES DEMO",
    plant: "cuautitlan",
    active: true,
    costCenter: "DEMO-CUA-002",
    position: "OPERADOR DEMO",
  },
  {
    id: "90000003",
    name: "Carla Demostracion",
    area: "MANTENIMIENTO DEMO",
    plant: "toluca",
    active: true,
    costCenter: "DEMO-TOL-001",
    position: "TECNICA DE MANTENIMIENTO DEMO",
  },
  {
    id: "90000004",
    name: "Empleado Inactivo Demo",
    area: "OPERACIONES DEMO",
    plant: "toluca",
    active: false,
    costCenter: "DEMO-TOL-002",
    position: "OPERADOR DEMO",
  },
];

const DEMO_CATALOG: readonly DemoCatalogItem[] = [
  {
    sku: "62XJ76",
    material: "26008560",
    name: "Manga Resistente A Cortes Negro Ch PQ50",
    category: "Ropa",
    replacementDays: 30,
    initialStock: 25,
    minStock: 2,
    unitCost: 148.5,
    durationRuleId: "kof-62xj76",
    requiredQuantity: 1,
    requiredUnit: "Par",
    packageUnit: "CAJA",
    unitsPerPackage: 25,
    packageRuleId: "sap-26008560",
  },
  {
    sku: "62XJ77",
    material: "26008561",
    name: "Manga Resistente A Cortes Negro G PQ50",
    category: "Ropa",
    replacementDays: 30,
    initialStock: 25,
    minStock: 2,
    unitCost: 152.25,
    durationRuleId: "kof-62xj77",
    requiredQuantity: 1,
    requiredUnit: "Par",
    packageUnit: "CAJA",
    unitsPerPackage: 25,
    packageRuleId: "sap-26008561",
  },
  {
    sku: "DEMO-CASCO-01",
    material: "DEMO-MAT-CASCO-01",
    name: "Casco de Seguridad Demo",
    category: "Cascos",
    replacementDays: 365,
    initialStock: 12,
    minStock: 3,
    unitCost: 320,
  },
  {
    sku: "DEMO-GAFAS-01",
    material: "DEMO-MAT-GAFAS-01",
    name: "Gafas de Seguridad Demo",
    category: "Gafas",
    replacementDays: 180,
    initialStock: 8,
    minStock: 2,
    unitCost: 95,
  },
];

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function addHours(value: Date, hours: number) {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

function inventoryId(plant: DemoPlant, sku: string) {
  return `${plant}__${sku}`;
}

function cleanUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function privateCatalogPayload(
  plant: DemoPlant,
  item: DemoCatalogItem,
  currentStock: number,
  now: Date
) {
  return cleanUndefined({
    sku: item.sku,
    material: item.material,
    name: item.name,
    category: item.category,
    replacementDays: item.replacementDays,
    durationRuleId: item.durationRuleId,
    durationRuleSource: item.durationRuleId ? "catalog" : undefined,
    durationRuleSku: item.durationRuleId ? item.sku : undefined,
    durationRuleSapMaterial: item.durationRuleId ? item.material : undefined,
    requiredQuantity: item.requiredQuantity,
    requiredUnit: item.requiredUnit,
    stock: currentStock,
    minStock: item.minStock,
    reorderPoint: item.minStock,
    hasSizes: false,
    location: plant === "cuautitlan" ? "DEMO-CUA-A1" : "DEMO-TOL-A1",
    unit: "PZA",
    unitCost: item.unitCost,
    stockUnit: "PZA",
    packageUnit: item.packageUnit,
    unitsPerPackage: item.unitsPerPackage,
    stockPackageInput: item.unitsPerPackage ? 1 : undefined,
    packageRuleId: item.packageRuleId,
    plantaId: plant,
    active: true,
    available: currentStock > 0,
    source: DEMO_SOURCE,
    schemaVersion: 1,
    demoData: true,
    createdAt: now,
    updatedAt: now,
  });
}

function publicCatalogPayload(plant: DemoPlant, item: DemoCatalogItem, now: Date) {
  return cleanUndefined({
    sku: item.sku,
    name: item.name,
    category: item.category,
    replacementDays: item.replacementDays,
    durationRuleId: item.durationRuleId,
    durationRuleSource: item.durationRuleId ? "catalog" : undefined,
    durationRuleSku: item.durationRuleId ? item.sku : undefined,
    requiredQuantity: item.requiredQuantity,
    requiredUnit: item.requiredUnit,
    hasSizes: false,
    plantaId: plant,
    active: true,
    available: item.initialStock > 0,
    demoData: true,
    updatedAt: now,
  });
}

export function validateStagingDemoTarget(target: StagingDemoTarget) {
  const projectId = target.projectId.trim();
  const databaseId = target.databaseId.trim();
  const confirmation = target.confirmation.trim();

  if (!projectId || !/(staging|demo)/i.test(projectId)) {
    throw new Error("Demo seed refuses projects that are not explicitly staging or demo.");
  }
  if (databaseId !== "(default)") {
    throw new Error("Demo seed only supports the isolated (default) staging database.");
  }
  if (confirmation !== projectId) {
    throw new Error("Demo seed confirmation must exactly match the target project ID.");
  }

  return { projectId, databaseId };
}

export function buildStagingDemoDocuments(now = new Date()): StagingDemoDocument[] {
  const documents: StagingDemoDocument[] = [];

  for (const employee of DEMO_EMPLOYEES) {
    const common = {
      id: employee.id,
      name: employee.name,
      area: employee.area,
      active: employee.active,
      plantaId: employee.plant,
      personnelArea: employee.plant === "cuautitlan" ? "DEMO CUAUTITLAN" : "DEMO TOLUCA",
      plantArea: employee.area,
      costCenter: employee.costCenter,
      position: employee.position,
      jobFunction: "FUNCION FICTICIA DE DEMOSTRACION",
      source: DEMO_SOURCE,
      schemaVersion: 1,
      firstLogin: true,
      termsAccepted: false,
      credentialVersion: 1,
      demoData: true,
      updatedAt: now,
    };

    documents.push({
      collection: "employees",
      id: employee.id,
      data: {
        ...common,
        division: "DIVISION DEMO",
        positionId: `DEMO-${employee.id}`,
        hireDate: "2025-01-15",
        sex: "X",
        createdAt: now,
      },
    });
    documents.push({
      collection: "kiosk_employees",
      id: employee.id,
      data: common,
    });
  }

  for (const plant of ["cuautitlan", "toluca"] as const) {
    for (const item of DEMO_CATALOG) {
      const itemId = inventoryId(plant, item.sku);
      const hasSeedAssignment = plant === "cuautitlan" && item.sku === "DEMO-CASCO-01";
      const currentStock = item.initialStock - (hasSeedAssignment ? 1 : 0);

      documents.push({
        collection: "ppe_catalog",
        id: itemId,
        data: privateCatalogPayload(plant, item, currentStock, now),
      });
      documents.push({
        collection: "kiosk_catalog",
        id: itemId,
        data: publicCatalogPayload(plant, item, now),
      });
      documents.push({
        collection: "inventory_movements",
        id: `demo-import-${itemId}`,
        data: {
          itemId,
          sku: item.sku,
          size: "N/A",
          type: "import",
          previousStock: 0,
          newStock: item.initialStock,
          delta: item.initialStock,
          reason: "Inventario ficticio inicial de staging",
          source: "import",
          plantaId: plant,
          performedByUid: "demo-seed",
          performedByEmail: "demo-seed@assetguard.invalid",
          metadata: {
            demoData: true,
            itemName: item.name,
            unitsPerPackage: item.unitsPerPackage ?? null,
          },
          createdAt: now,
        },
      });
    }

    documents.push({
      collection: "budget_goals",
      id: `${plant}-${now.getUTCFullYear()}`,
      data: {
        plantaId: plant,
        year: now.getUTCFullYear(),
        annualLimit: 150000,
        monthlyLimits: {},
        alertThresholds: [70, 85, 95],
        currency: "MXN",
        createdBy: "demo-seed",
        updatedBy: "demo-seed",
        demoData: true,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const assignmentId = "demo-assignment-90000002-casco";
  const assignmentItemId = inventoryId("cuautitlan", "DEMO-CASCO-01");
  const assignedAt = addDays(now, -2);
  documents.push({
    collection: "assignments",
    id: assignmentId,
    data: {
      employeeId: "90000002",
      employeeName: "Bruno Demostracion",
      employeeArea: "OPERACIONES DEMO",
      area: "OPERACIONES DEMO",
      plantaId: "cuautitlan",
      sku: "DEMO-CASCO-01",
      material: "DEMO-MAT-CASCO-01",
      itemId: assignmentItemId,
      itemName: "Casco de Seguridad Demo",
      unitCost: 320,
      category: "Cascos",
      quantity: 1,
      issuedQuantity: 1,
      quantityUnit: "PZA",
      replacementDays: 365,
      size: "N/A",
      assignedAt,
      nextReplacementAt: addDays(assignedAt, 365),
      status: "active",
      issuedByUserId: "demo-seed",
      issuedByEmail: "demo-seed@assetguard.invalid",
      source: DEMO_SOURCE,
      demoData: true,
    },
  });
  documents.push({
    collection: "inventory_movements",
    id: `demo-assignment-${assignmentItemId}`,
    data: {
      itemId: assignmentItemId,
      sku: "DEMO-CASCO-01",
      size: "N/A",
      type: "assignment",
      previousStock: 12,
      newStock: 11,
      delta: -1,
      reason: "Asignacion ficticia inicial de staging",
      source: "system",
      plantaId: "cuautitlan",
      performedByUid: "demo-seed",
      performedByEmail: "demo-seed@assetguard.invalid",
      metadata: {
        assignmentId,
        employeeId: "90000002",
        demoData: true,
      },
      createdAt: assignedAt,
    },
  });

  const requestId = "demo-request-90000003-manga";
  const requestItemId = inventoryId("toluca", "62XJ76");
  const requestCreatedAt = addHours(now, -1);
  documents.push({
    collection: "kiosk_requests",
    id: requestId,
    data: {
      employeeId: "90000003",
      employeeName: "Carla Demostracion",
      employeeArea: "MANTENIMIENTO DEMO",
      plantaId: "toluca",
      items: [
        {
          itemId: requestItemId,
          itemName: "Manga Resistente A Cortes Negro Ch PQ50",
          sku: "62XJ76",
          size: "N/A",
          replacementDays: 30,
          durationRuleId: "kof-62xj76",
          durationRuleSource: "catalog",
          durationRuleSku: "62XJ76",
          durationRuleSapMaterial: "26008560",
          requiredQuantity: 1,
          requiredUnit: "Par",
          category: "Ropa",
          replacementReason: "desgaste",
        },
      ],
      status: "pending",
      hasEarlyReplacementAlert: false,
      earlyReplacementWarnings: [],
      earlyReplacementAlertIds: [],
      assignmentIds: [],
      source: DEMO_SOURCE,
      demoData: true,
      createdAt: requestCreatedAt,
      updatedAt: requestCreatedAt,
    },
  });
  documents.push({
    collection: "kiosk_request_status",
    id: requestId,
    data: {
      requestId,
      status: "pending",
      plantaId: "toluca",
      source: DEMO_SOURCE,
      demoData: true,
      updatedAt: requestCreatedAt,
    },
  });

  documents.push({
    collection: "audit_events",
    id: "staging-demo-seed-v1",
    data: {
      type: "demo.seed",
      actorUid: null,
      actorEmail: null,
      targetCollection: "staging",
      targetId: "demo-v1",
      before: null,
      after: { dataset: "demo-v1" },
      metadata: {
        demoData: true,
        employees: DEMO_EMPLOYEES.length,
        catalogItemsPerPlant: DEMO_CATALOG.length,
      },
      ipHash: null,
      userAgent: "staging-demo-seed",
      createdAt: now,
    },
  });

  return documents;
}
