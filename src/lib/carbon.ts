export type CarbonMaterialShare = {
  id: string;
  materialId: string;
  otherLabel?: string;
  sharePct: number | null;
  recycledPct?: number | null;
};

export type CarbonArticle = {
  id: string;
  label: string;
  description?: string;
  unitWeightKg: number | null;
  quantityPerSet: number | null;
  materials: CarbonMaterialShare[];
};

export type CarbonArticleSuggestion = {
  label: string;
  description?: string;
};

export type CarbonEstimate = {
  version: 1;
  enabled: boolean;
  articles: CarbonArticle[];
};

export type CarbonEstimateResult = {
  kgCo2ePerSet: number;
  weightKgPerSet: number;
  articleCount: number;
};

export const CARBON_MATERIALS = [
  { id: "pvc_expanded", label: "PVC expansé", factorKgCo2ePerKg: 3.1 },
  { id: "pvc_rigid", label: "PVC rigide", factorKgCo2ePerKg: 3.1 },
  { id: "pmma", label: "PMMA / Plexiglas", factorKgCo2ePerKg: 6 },
  { id: "pet", label: "PET", factorKgCo2ePerKg: 3 },
  { id: "petg", label: "PETG", factorKgCo2ePerKg: 3.5 },
  { id: "polycarbonate", label: "Polycarbonate", factorKgCo2ePerKg: 5.6 },
  { id: "polypropylene", label: "Polypropylène (PP)", factorKgCo2ePerKg: 2 },
  { id: "polyethylene", label: "Polyéthylène (PE)", factorKgCo2ePerKg: 2 },
  { id: "abs", label: "ABS", factorKgCo2ePerKg: 3.8 },
  { id: "polystyrene", label: "Polystyrène / HIPS", factorKgCo2ePerKg: 3.4 },
  { id: "cardboard", label: "Carton", factorKgCo2ePerKg: 0.9 },
  { id: "paper", label: "Papier", factorKgCo2ePerKg: 1.1 },
  { id: "wood", label: "Bois massif", factorKgCo2ePerKg: 0.2 },
  { id: "mdf", label: "MDF", factorKgCo2ePerKg: 0.7 },
  { id: "plywood", label: "Contreplaqué", factorKgCo2ePerKg: 0.7 },
  { id: "melamine", label: "Mélaminé / aggloméré", factorKgCo2ePerKg: 0.8 },
  { id: "steel", label: "Acier", factorKgCo2ePerKg: 2.3 },
  { id: "aluminium", label: "Aluminium", factorKgCo2ePerKg: 8.7 },
  { id: "glass", label: "Verre", factorKgCo2ePerKg: 1.2 },
  { id: "polyester_textile", label: "Textile polyester", factorKgCo2ePerKg: 5.5 },
  { id: "foam", label: "Mousse", factorKgCo2ePerKg: 3.2 },
  { id: "adhesive_vinyl", label: "Vinyle adhésif", factorKgCo2ePerKg: 3.1 },
  { id: "other", label: "Autre matière", factorKgCo2ePerKg: null },
] as const;

const CARBON_FACTOR_BY_MATERIAL = new Map<string, number | null>(
  CARBON_MATERIALS.map((material) => [material.id, material.factorKgCo2ePerKg]),
);

/**
 * Compact commercial estimate, not a scientific LCA.
 * Material factors are conservative production averages in kg CO2e/kg.
 * Known recycled content receives a capped 40% reduction, blended by its share.
 */
export function calculateCarbonEstimate(input: unknown): CarbonEstimateResult | null {
  const estimate = normalizeCarbonEstimate(input);
  if (!estimate.enabled || estimate.articles.length === 0) return null;

  let kgCo2ePerSet = 0;
  let weightKgPerSet = 0;

  for (const article of estimate.articles) {
    const unitWeightKg = Number(article.unitWeightKg);
    const quantityPerSet = Number(article.quantityPerSet);
    if (!(unitWeightKg > 0) || !(quantityPerSet > 0) || article.materials.length === 0) {
      return null;
    }

    const shareTotal = article.materials.reduce(
      (total, material) => total + (Number(material.sharePct) || 0),
      0,
    );
    if (Math.abs(shareTotal - 100) > 0.01) return null;

    const articleWeightKg = unitWeightKg * quantityPerSet;
    weightKgPerSet += articleWeightKg;

    for (const material of article.materials) {
      const factor = CARBON_FACTOR_BY_MATERIAL.get(material.materialId);
      const share = Number(material.sharePct) / 100;
      if (factor === null || factor === undefined || !(share >= 0)) return null;
      const recycledPct = Math.min(100, Math.max(0, Number(material.recycledPct) || 0));
      const recycledAdjustment = 1 - (recycledPct / 100) * 0.4;
      kgCo2ePerSet += articleWeightKg * share * factor * recycledAdjustment;
    }
  }

  if (!(kgCo2ePerSet > 0)) return null;
  return {
    kgCo2ePerSet,
    weightKgPerSet,
    articleCount: estimate.articles.length,
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createCarbonMaterial(): CarbonMaterialShare {
  return {
    id: createCarbonId("matiere"),
    materialId: "",
    sharePct: 100,
    recycledPct: null,
  };
}

export function createCarbonArticle(suggestion?: CarbonArticleSuggestion): CarbonArticle {
  return {
    id: createCarbonId("article"),
    label: suggestion?.label ?? "",
    description: suggestion?.description ?? "",
    unitWeightKg: null,
    quantityPerSet: 1,
    materials: [createCarbonMaterial()],
  };
}

export function createCarbonEstimate(): CarbonEstimate {
  return {
    version: 1,
    enabled: false,
    articles: [],
  };
}

export function normalizeCarbonEstimate(input: unknown): CarbonEstimate {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rawArticles = Array.isArray(source.articles) ? source.articles : [];

  return {
    version: 1,
    enabled: source.enabled === true,
    articles: rawArticles.map((rawArticle, articleIndex) => {
      const article =
        rawArticle && typeof rawArticle === "object" ? (rawArticle as Record<string, unknown>) : {};
      const rawMaterials = Array.isArray(article.materials) ? article.materials : [];
      return {
        id: text(article.id) || `article-${articleIndex}`,
        label: text(article.label),
        description: text(article.description),
        unitWeightKg: optionalNumber(article.unitWeightKg),
        quantityPerSet: optionalNumber(article.quantityPerSet) ?? 1,
        materials: rawMaterials.map((rawMaterial, materialIndex) => {
          const material =
            rawMaterial && typeof rawMaterial === "object"
              ? (rawMaterial as Record<string, unknown>)
              : {};
          return {
            id: text(material.id) || `article-${articleIndex}-matiere-${materialIndex}`,
            materialId: text(material.materialId),
            otherLabel: text(material.otherLabel),
            sharePct: optionalNumber(material.sharePct),
            recycledPct: optionalNumber(material.recycledPct),
          };
        }),
      };
    }),
  };
}

function createCarbonId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
