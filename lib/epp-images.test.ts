import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEppImageUrl } from "./epp-images";

describe("resolveEppImageUrl", () => {
  it("prefiere el identificador del material sobre un nombre descriptivo cruzado", () => {
    assert.equal(
      resolveEppImageUrl({
        id: "epp-bota",
        sku: "28M541",
        material: "28M541",
        name: "Guantes anticorte",
      }),
      "/epp/28M541_BOTA%20HULE%20NEGRA%20S_CASQUILLO%20T23.png"
    );
  });

  it("resuelve el codigo KOF aunque el inventario venga con material SAP", () => {
    assert.equal(
      resolveEppImageUrl({
        id: "epp-guante-nailon",
        sku: "26007693",
        material: "26007693",
        name: "Bota de seguridad",
      }),
      "/epp/191K41Guantes%20Nailon%20N%206%20Blanco%20Negro%20PR.png"
    );
  });

  it("respeta la talla seleccionada antes del nombre base", () => {
    assert.equal(
      resolveEppImageUrl({
        id: "epp-bota-hule",
        name: "Bota hule negra",
        sizes: {
          "23": { sku: "28M541" },
          "24": { sku: "28M542" },
        },
      }, "24"),
      "/epp/28M542_BOTA%20HULE%20NEGRA%20S_CASQUILLO%20T24.png"
    );
  });
});
