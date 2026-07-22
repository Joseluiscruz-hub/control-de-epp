import assert from "node:assert/strict";
import test from "node:test";
import { buildKioskEmployeeSyncPayload } from "./kiosk-employee-sync";

test("sincroniza el centro de costos y los datos operativos del colaborador", () => {
  assert.deepEqual(
    buildKioskEmployeeSyncPayload(
      {
        name: "Ana Perez",
        area: "Produccion",
        plantaId: "toluca",
        personnelArea: "Operaciones",
        plantArea: "Linea 1",
        costCenter: "PRODUCCION",
        position: "Operadora",
        jobFunction: "Envasado",
        active: true,
      },
      "cuautitlan"
    ),
    {
      name: "Ana Perez",
      area: "Produccion",
      plantaId: "toluca",
      personnelArea: "Operaciones",
      plantArea: "Linea 1",
      costCenter: "PRODUCCION",
      position: "Operadora",
      jobFunction: "Envasado",
      active: true,
    }
  );
});

test("usa valores seguros cuando el snapshot tiene campos incompletos", () => {
  assert.deepEqual(buildKioskEmployeeSyncPayload({ area: "Almacen" }, "cuautitlan"), {
    name: "",
    area: "Almacen",
    plantaId: "cuautitlan",
    personnelArea: "",
    plantArea: "Almacen",
    costCenter: "",
    position: "",
    jobFunction: "",
    active: false,
  });
});
