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

export const CARBON_MATERIALS = [
  { id: "pvc_expanded", label: "PVC expansé" },
  { id: "pvc_rigid", label: "PVC rigide" },
  { id: "pmma", label: "PMMA / Plexiglas" },
  { id: "pet", label: "PET" },
  { id: "petg", label: "PETG" },
  { id: "polycarbonate", label: "Polycarbonate" },
  { id: "polypropylene", label: "Polypropylène (PP)" },
  { id: "polyethylene", label: "Polyéthylène (PE)" },
  { id: "abs", label: "ABS" },
  { id: "polystyrene", label: "Polystyrène / HIPS" },
  { id: "cardboard", label: "Carton" },
  { id: "paper", label: "Papier" },
  { id: "wood", label: "Bois massif" },
  { id: "mdf", label: "MDF" },
  { id: "plywood", label: "Contreplaqué" },
  { id: "melamine", label: "Mélaminé / aggloméré" },
  { id: "steel", label: "Acier" },
  { id: "aluminium", label: "Aluminium" },
  { id: "glass", label: "Verre" },
  { id: "polyester_textile", label: "Textile polyester" },
  { id: "foam", label: "Mousse" },
  { id: "adhesive_vinyl", label: "Vinyle adhésif" },
  { id: "other", label: "Autre matière" },
] as const;

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

