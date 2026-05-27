export interface EppDurationRule {
  id: string;
  sapMaterial?: string;
  kofSku: string;
  description: string;
  quantity: number;
  unit: "Pza" | "Par";
  replacementDays: number;
}

export interface EppRuleLookupInput {
  sku?: string;
  material?: string;
  name?: string;
  description?: string;
  codes?: Array<string | undefined | null>;
  sizes?: Record<string, { sku?: string; material?: string } | undefined>;
}

export const EPP_DURATION_RULES: EppDurationRule[] = [
  {
    id: "kof-2ztm8",
    sapMaterial: "26148326",
    kofSku: "2ZTM8",
    description: "Mascarilla Ajustable Des.,Universal,PQ10",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-2cvh2",
    sapMaterial: "26149988",
    kofSku: "2CVH2",
    description: "Lentes d/Seg,A800,Transp,Transp",
    quantity: 1,
    unit: "Pza",
    replacementDays: 45,
  },
  {
    id: "kof-2lem0",
    kofSku: "2LEM0",
    description: "Guantes R/Quimico,T7,Puno Recto,PR,PQ1",
    quantity: 1,
    unit: "Par",
    replacementDays: 30,
  },
  {
    id: "kof-2lem1",
    sapMaterial: "26149553",
    kofSku: "2LEM1",
    description: "Guantes R/Quimico T8,Puno Recto,PR,PQ1",
    quantity: 1,
    unit: "Par",
    replacementDays: 30,
  },
  {
    id: "kof-2lem2",
    sapMaterial: "26149554",
    kofSku: "2LEM2",
    description: "Guantes R/Quimico T9 Puno Recto,PR,PQ1",
    quantity: 1,
    unit: "Par",
    replacementDays: 30,
  },
  {
    id: "kof-2lem3",
    sapMaterial: "26149555",
    kofSku: "2LEM3",
    description: "Guantes R/Quimico T10 Puno Recto,PR,PQ",
    quantity: 1,
    unit: "Par",
    replacementDays: 30,
  },
  {
    id: "kof-2kjm5",
    sapMaterial: "26148260",
    kofSku: "2KJM5",
    description: "Soporte Sacrolumbar Elastico,8An,Ngr,CH",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-2kjm6",
    sapMaterial: "26148261",
    kofSku: "2KJM6",
    description: "Soporte Sacrolumbar Elastico,8An,Negro,M",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-2kjm7",
    sapMaterial: "26148262",
    kofSku: "2KJM7",
    description: "Soporte Sacrolumbar Elastico,8An,Negro,GD",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-2kpm0",
    sapMaterial: "26149605",
    kofSku: "2KPM0",
    description: "Overol c/Capucha,Blanco,Tyvek(R),M,PQ25",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-2kpm2",
    sapMaterial: "26149607",
    kofSku: "2KPM2",
    description: "Overol c/Capucha,Blanco,Tyvek(R),XG,PQ25",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-2kpm3",
    sapMaterial: "26149608",
    kofSku: "2KPM3",
    description: "Overol c/Capucha,Blnco,Tyvek(R),2XG,PQ25",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-3pnm9",
    sapMaterial: "26149609",
    kofSku: "3PNM9",
    description: "Overol c/Capucha,Ama,Tychem(R) QC,M,PQ12",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-3ppm0",
    sapMaterial: "26149610",
    kofSku: "3PPM0",
    description: "Overol con Capucha,Tychem(R) QC,G,PQ12",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-28c088",
    sapMaterial: "26149580",
    kofSku: "28C088",
    description: "Tapones Auditivos Reutilizables,25dB,PQ100",
    quantity: 1,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-1yem2",
    sapMaterial: "26149578",
    kofSku: "1YEM2",
    description: "Tapones p/Oidos,29dB,Bridado,Univ,PQ100",
    quantity: 2,
    unit: "Pza",
    replacementDays: 30,
  },
  {
    id: "kof-62xj76",
    sapMaterial: "26008560",
    kofSku: "62XJ76",
    description: "Manga Resistente a Cortes,Negro,CH,PQ50",
    quantity: 1,
    unit: "Par",
    replacementDays: 30,
  },
  {
    id: "kof-62xj77",
    sapMaterial: "26008561",
    kofSku: "62XJ77",
    description: "Manga Resistente a Cortes,Negro,G,PQ50",
    quantity: 1,
    unit: "Par",
    replacementDays: 30,
  },
  {
    id: "kof-191k41",
    sapMaterial: "26007693",
    kofSku: "191K41",
    description: "Guantes,Nailon,Tamano 6,Blanco/Negro,PR",
    quantity: 1,
    unit: "Par",
    replacementDays: 45,
  },
  {
    id: "kof-191k42",
    sapMaterial: "26007692",
    kofSku: "191K42",
    description: "Guantes,Nailon,Tamano 7,Blanco/Negro,PR",
    quantity: 1,
    unit: "Par",
    replacementDays: 45,
  },
  {
    id: "kof-191k43",
    sapMaterial: "26007691",
    kofSku: "191K43",
    description: "Guantes,Nailon,Tamano 8,Blanco/Negro,PR",
    quantity: 1,
    unit: "Par",
    replacementDays: 45,
  },
  {
    id: "kof-191k44",
    sapMaterial: "26007690",
    kofSku: "191K44",
    description: "Guantes,Nailon,Tamano 9,Blanco/Negro,PR",
    quantity: 1,
    unit: "Par",
    replacementDays: 45,
  },
  {
    id: "kof-191k45",
    sapMaterial: "26007694",
    kofSku: "191K45",
    description: "Guantes,Nailon,Tamano 10,Blanco/Negro,P",
    quantity: 1,
    unit: "Par",
    replacementDays: 45,
  },
  {
    id: "kof-432em0",
    kofSku: "432EM0",
    description: "Guante de piel Puno abierto Talla universal",
    quantity: 1,
    unit: "Par",
    replacementDays: 30,
  },
];

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const RULE_BY_CODE = new Map<string, EppDurationRule>();

for (const rule of EPP_DURATION_RULES) {
  RULE_BY_CODE.set(normalizeCode(rule.kofSku), rule);
  if (rule.sapMaterial) RULE_BY_CODE.set(normalizeCode(rule.sapMaterial), rule);
}

export function getEppDurationRule(input: EppRuleLookupInput): EppDurationRule | undefined {
  const candidates = [
    input.sku,
    input.material,
    ...(input.codes ?? []),
    ...Object.values(input.sizes ?? {}).flatMap((variant) => [
      variant?.sku,
      variant?.material,
    ]),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const rule = RULE_BY_CODE.get(normalizeCode(candidate));
    if (rule) return rule;
  }

  const haystack = normalizeText([input.name, input.description].filter(Boolean).join(" "));
  if (!haystack) return undefined;

  return EPP_DURATION_RULES.find((rule) => {
    const aliases = [rule.kofSku, rule.sapMaterial].filter(Boolean) as string[];
    return aliases.some((alias) => haystack.includes(normalizeCode(alias)));
  });
}

export function resolveEppReplacementDays(input: EppRuleLookupInput, fallbackDays: number) {
  return getEppDurationRule(input)?.replacementDays ?? fallbackDays;
}

export function getEppDurationRulePayload(input: EppRuleLookupInput) {
  const rule = getEppDurationRule(input);
  if (!rule) return {};

  return {
    durationRuleId: rule.id,
    durationRuleSource: "COCA_KOF_SAP",
    durationRuleSku: rule.kofSku,
    durationRuleSapMaterial: rule.sapMaterial ?? null,
    requiredQuantity: rule.quantity,
    requiredUnit: rule.unit,
  };
}
