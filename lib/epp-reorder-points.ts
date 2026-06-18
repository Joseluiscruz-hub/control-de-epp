export const EPP_REORDER_POINTS: Record<string, number> = {
  "26149605": 5,
  "26149608": 5,
  "32007822": 3,
  "26149607": 5,
  "26149609": 5,
  "26148378": 2,
  "26149552": 3,
  "26149553": 3,
  "26149554": 3,
  "26149555": 3,
  "26148370": 5,
  "26148371": 2,
  "26149551": 2,
  "26149637": 8,
  "26010273": 3,
  "26149965": 5,
  "26005912": 2,
  "26004990": 4,
  "26148247": 5,
  "26149623": 3,
  "26148323": 3,
  "26149624": 3,
  "26149620": 3,
  "26149622": 3,
  "26148321": 3,
  "26148339": 3,
  "26149618": 2,
  "26149616": 2,
  "26149617": 2,
  "26148325": 3,
  "26148326": 3,
  "26149611": 3,
  "26149610": 3,
  "26146983": 3,
  "26146982": 3,
  "26146984": 3,
  "26008561": 2,
  "26008560": 2,
  "26149541": 20,
  "26149544": 5,
  "26149542": 5,
  "26149545": 5,
  "26149543": 5,
  "26148313": 5,
  "26148682": 5,
  "26148683": 5,
  "26148684": 5,
  "26148685": 5,
  "26148686": 5,
  "26146979": 5,
  "26146980": 5,
  "26146981": 5,
  "26007693": 30,
  "26007692": 30,
  "26007691": 30,
  "26007690": 30,
  "26007694": 20,
  "26013315": 20,
  "26148260": 5,
  "26148261": 5,
  "26148263": 5,
  "26148262": 5,
  "26017000": 10,
  "26148269": 8,
  "26148312": 5,
  "26149580": 2,
  "26149578": 2,
  "26006433": 20,
  "26005583": 20,
};

export function normalizeEppMaterialCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^0-9A-Z]/g, "")
    : "";
}

export function getEppReorderPoint(...codes: unknown[]) {
  for (const code of codes) {
    const normalized = normalizeEppMaterialCode(code);
    if (normalized && Object.prototype.hasOwnProperty.call(EPP_REORDER_POINTS, normalized)) {
      return EPP_REORDER_POINTS[normalized];
    }
  }
  return undefined;
}

export function hasEppReorderPoint(...codes: unknown[]) {
  return getEppReorderPoint(...codes) !== undefined;
}
