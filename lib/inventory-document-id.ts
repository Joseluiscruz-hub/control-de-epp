import { parsePlantId, type PlantId } from "./plants";

export type ExistingInventoryDocument = {
  exists: boolean;
  plantaId?: unknown;
};

export function selectInventoryImportDocumentId(params: {
  baseId: string;
  scopedId: string;
  plantaId: PlantId;
  baseDocument?: ExistingInventoryDocument;
  scopedDocument?: ExistingInventoryDocument;
}) {
  if (params.scopedDocument?.exists) return params.scopedId;

  if (params.baseDocument?.exists) {
    const existingPlant = parsePlantId(params.baseDocument.plantaId);
    if (!existingPlant || existingPlant === params.plantaId) {
      return params.baseId;
    }
  }

  return params.scopedId;
}
