import { getEppDurationRule } from "./epp-duration-rules";

type EppImageVariant = {
  sku?: string;
  material?: string;
};

type EppImageItem = {
  id?: string;
  docId?: string;
  sku?: string;
  material?: string;
  name?: string;
  imageUrl?: string;
  sizes?: Record<string, EppImageVariant>;
};

const EPP_IMAGE_FILES = [
  "191K41Guantes Nailon N 6 Blanco Negro PR.png",
  "191K42Guantes Nailon N 7 Blanco Negro PR.png",
  "191K43Guantes Nailon N 8 Blanco Negro PR.png",
  "191K44Guantes Nailon N 9 Blanco Negro PR.png",
  "191K45Guantes Nailon N10 Blanco Negro PR.png",
  "1HP85_CARTUCHO P_VAPORES ORGANICO_GAS.png",
  "1HP89_CARTUCHO P VAPORES ORGANICOS.png",
  "1WP33_RESPIRADOR CARA COMPLETA T-M.png",
  "1WP34_RESPIRADOR CARA COMPLETA T-L.png",
  "1WR10_CAPUCHA P_SOLDADOR.png",
  "1YDM1_PREFILTRO N95 P_PARTICULAS PAQ 10.png",
  "1YDM2_CARTUCHO AMON. PAQ 2.png",
  "1YDM4_CARTUCHO GASES AC. PAQ 2.png",
  "1YEM2_TAPON NARANJA C_CORDON DESECHABLE.png",
  "28C088_TAPON ULTRAFIT C_CORDON REUTILIZA.png",
  "28M541_BOTA HULE NEGRA S_CASQUILLO T23.png",
  "28M542_BOTA HULE NEGRA S_CASQUILLO T24.png",
  "28N838_PROTEC AUDITI 25DB P_CASCOMSA NRR.png",
  "28P601_TIRANTE BARBIQ GRIS C_BARBI PLSTC.png",
  "2JGM3_PANT. C_PETO-TIRANTES T-M.png",
  "2JGM4_PANT. C_PETO-TIRANTES T-G.png",
  "2JGM6_PANT. C_PETO-TIRANTES T-XL.png",
  "2JN08_CARTUCHO MULTIGAS 3M 6006 PAQ 2.png",
  "2JP66_CASCO AZUL MSA.png",
  "2JP68_CASCO VERDE MSA.png",
  "2JP70_CASCO NARANJA MSA.png",
  "2JP72_CASCO ROJO MSA.png",
  "2JP75_CASCO BLANCO MSA.png",
  "2KJM5_FAJA C_SOPORTE SACROLUMBAR T-CH.png",
  "2KJM6_FAJA C_SOPORTE SACROLUMBAR T-M..png",
  "2KJM7_FAJA C_SOPORTE SACROLUMBAR T-G.png",
  "2KJM8_FAJA C_SOPORTE SACROLUMBAR T-XG.png",
  "2KPM0_OVEROL TYVEK, T-M.png",
  "2KPM2_OVEROL TYVEK T-XL.png",
  "2KPM3_OVEROL TYVEK T-XXL.png",
  "2LEM0_GUANTE NITRILO VERDE T-7.png",
  "2LEM1_GUANTE NITRILO VERDE T-8.png",
  "2LEM2_GUANTE NITRILO VERDE T-9.png",
  "2LEM3_GUANTE NITRILO VERDE T-10.png",
  "2ZTM8_MASCARILLA HUMOS SOLDADURA_ OZONO.png",
  "3AK92_IMPERMEABLE AMARILLO T-M.png",
  "3PNM9_OVEROL AMARILLO RESIST QUIMICO T-M.png",
  "3PPM0_OVEROL AMARILLO RESIST QUIMICO T-G.png",
  "3PPM1_OVEROL AMARILLO RESIST QUIMICO TXL.png",
  "42EX32 CHALECO AMARILLO CH ALTA VIS.png",
  "4AG93_GAFAS D_SEGUR. LENTE CLARO.png",
  "4NHM7 BOTA BLANCA CON CASQUILLO_T5.png",
  "4NHM8 BOTA BLANCA CON CASQUILLO_T6.png",
  "4NHM9 BOTA BLANCA CON CASQUILLO T7.png",
  "4NJM0 BOTA BLANCA CON CASQUILLO T8.png",
  "4NJM1 BOTA BLANCA CON CASQUILLO T9.png",
  "51WK02 CHALECO ALTA-VIS AMARILLO UNIV.png",
  "5AD49_IMPERMEABLE AMARILLO T-XL.png",
  "5AZ31_IMPERMEABLE AMARILLO T-G.png",
  "5MZP1_RODILLERAS.png",
  "6FGZ6 CONO DE TRAFICO 36 PUL ROJO O NAR.png",
  "6FHC4 CONO TRAFICO 36 PULG ROJO_NARANJA.png",
  "ANTICAIDAS_AUTORRETRACTIL CONEX RAPIDA.png",
  "Casco MSA EPP M2303541ARF BLANCO.png",
  "GUANTE ARGONERO CON AJUSTE EN MUÑECA.png",
  "Guantes ANSELL 37-175_10 EPP WF510.png",
  "Guantes ANSELL EPP PM-37175-8.png",
  "Guantes ANSELL EPP PM-37175-9.png",
  "Guantes EDGE 48-706_825434 EPP 191K41 T6.png",
  "Guantes EDGE 48-706_825435 EPP 191K42 T7.png",
  "Guantes EDGE 48-706_825436 EPP 191K43 T8.png",
  "Guantes EDGE 48-706_825437 EPP 191K44 T9.png",
  "Guantes EDGE 48-706_825438 EPP191K45 T10.png",
  "Lentes CONDOR  EPP 4VCF4.png",
  "Lentes HONEYWELL UVEX A805 EPP 2CVH2.png",
  "Manga Resistente a Cortes Negro CH PQ50.png",
  "Manga Resistente a Cortes Negro G PQ50.png",
  "Mascarilla 3M EPP 3M8515.png",
  "Overol Capucha CIE DUPONT EPP QC127S-M.png",
  "Overol DUPONT EPP QC127S-XL.png",
  "Overol DUPONT EPP TY127S-XXL.png",
  "Soporte JYRSA JYR-816CH3C EPP 2KJM5 CHIC.png",
  "Soporte JYRSA JYR-816GD3C EPP 2KJM7 GRAN.png",
  "Soporte JYRSA JYR-816MD3C EPP 2KJM6 MEDI.png",
] as const;

const IMAGE_ASSETS = EPP_IMAGE_FILES.map((file) => ({
  file,
  key: normalizeAssetKey(file.replace(/\.[^.]+$/, "")),
}));

function normalizeAssetKey(value?: string) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function toPublicEppUrl(file: string) {
  return `/epp/${encodeURIComponent(file)}`;
}

function uniqueValues(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const key = normalizeAssetKey(value ?? undefined);
    if (key.length < 4 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findByName(value?: string) {
  const key = normalizeAssetKey(value);
  if (key.length < 8) return undefined;

  return (
    IMAGE_ASSETS.find((asset) => asset.key === key) ??
    IMAGE_ASSETS.find((asset) => asset.key.includes(key) || key.includes(asset.key))
  );
}

function findByIdentifier(value?: string) {
  const key = normalizeAssetKey(value);
  if (key.length < 4) return undefined;

  return (
    IMAGE_ASSETS.find((asset) => asset.key === key) ??
    IMAGE_ASSETS.find((asset) => asset.key.startsWith(key)) ??
    IMAGE_ASSETS.find((asset) => asset.key.includes(key))
  );
}

function variantCandidates(item: EppImageItem, selectedSize?: string) {
  if (!item.sizes) return [];
  const selected = selectedSize ? item.sizes[selectedSize] : undefined;
  const variants = selected ? [selected] : Object.values(item.sizes);

  return variants.flatMap((variant) => [variant.sku, variant.material]);
}

function identifierCandidates(item: EppImageItem, selectedSize?: string) {
  const selectedVariantCodes = variantCandidates(item, selectedSize);
  const allVariantCodes = selectedSize ? variantCandidates(item) : [];
  const durationRule = getEppDurationRule({
    sku: item.sku,
    material: item.material,
    name: item.name,
    sizes: item.sizes,
    codes: [
      ...selectedVariantCodes,
      item.id,
      item.docId,
      ...allVariantCodes,
    ],
  });

  return uniqueValues([
    ...selectedVariantCodes,
    item.sku,
    item.material,
    durationRule?.kofSku,
    durationRule?.sapMaterial,
    item.id,
    item.docId,
    ...allVariantCodes,
  ]);
}

export function resolveEppImageUrl(item: EppImageItem, selectedSize?: string) {
  if (item.imageUrl) return item.imageUrl;

  const identifierAsset = identifierCandidates(item, selectedSize)
    .map(findByIdentifier)
    .find(Boolean);
  if (identifierAsset) return toPublicEppUrl(identifierAsset.file);

  const nameAsset = findByName(item.name);
  return nameAsset ? toPublicEppUrl(nameAsset.file) : undefined;
}
