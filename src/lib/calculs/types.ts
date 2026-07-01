// Shared calculation types

/**
 * Quantity scenario with an optional per-quantity margin override (%).
 * If margePct is null/undefined, the default calc margin is used.
 */
export type Quantite = {
  qty: number;
  margePct?: number | null;
};

/** Backward-compat: normalize legacy `number[]` payloads to `Quantite[]`. */
export function normalizeQuantites(input: unknown): Quantite[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => {
      if (typeof v === "number") return { qty: v, margePct: null };
      if (v && typeof v === "object" && "qty" in (v as any)) {
        const q = (v as any).qty;
        const m = (v as any).margePct;
        return {
          qty: Number(q) || 0,
          margePct: m === undefined || m === null || m === "" ? null : Number(m),
        };
      }
      return { qty: 0, margePct: null };
    })
    .filter((q) => q.qty > 0 || q.qty === 0);
}

export type LineItem = {
  fournisseur?: string;
  libelle: string;
  prixUnitaire: number;
  /** Optional per-line margin (%). Overrides quantity + default margin. */
  margePct?: number | null;
};

export type LineForfait = {
  fournisseur?: string;
  libelle: string;
  montantGlobal: number; // divided by quantité
  /** Optional per-line margin (%). Overrides quantity + default margin. */
  margePct?: number | null;
};

export type QuantityResult = {
  quantite: number;
  prixUnitaireAchat: number;
  prixVenteNetUnit: number;
  achatsTotal: number;
  fraisFixes: number;
  commissionSourcingUnit: number;
  commissionRapporteurUnit: number;
  commissionRapporteurTotal: number;
  totalPrixUnitaire: number;
  totalCA: number;
  totalDepenses: number;
  margeNet: number;
  margePct: number;
  alerteMarge: boolean;
  // optional Contra-specific
  margeContra?: number;
  margeContraPct?: number;
  margeAutres?: number;
  margeAutresPct?: number;
};

export type CalcOutput = {
  scenarios: QuantityResult[];
  totalMargeNet: number;
  totalCA: number;
};

/** Resolve effective margin (%) with priority: line > quantity > default. */
export function resolveMargePct(
  ligneMarge: number | null | undefined,
  quantiteMarge: number | null | undefined,
  defaultMarge: number,
): number {
  if (ligneMarge !== null && ligneMarge !== undefined && !Number.isNaN(ligneMarge)) {
    return Number(ligneMarge);
  }
  if (quantiteMarge !== null && quantiteMarge !== undefined && !Number.isNaN(quantiteMarge)) {
    return Number(quantiteMarge);
  }
  return defaultMarge;
}
