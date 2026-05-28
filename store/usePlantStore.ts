import { create } from "zustand";
import type { ActivePlantId } from "@/lib/plants";

interface PlantState {
  activePlantId: ActivePlantId;
  setActivePlant: (plantaId: ActivePlantId) => void;
}

export const usePlantStore = create<PlantState>((set) => ({
  activePlantId: "todas",
  setActivePlant: (activePlantId) => set({ activePlantId }),
}));
