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
  /**
   * Legacy single unit price. Kept for backward compatibility.
   * New dossiers use `prixParQuantite` aligned on the quantity columns.
   */
  prixUnitaire?: number;
  /**
   * Purchase price per quantity column, aligned by index with `quantites`.
   * Example: quantites [1, 10, 100] → prixParQuantite [100, 80, 45].
   */
  prixParQuantite?: number[];
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

/**
 * Resolve the purchase unit price for a line at a given quantity index.
 * Priority: prixParQuantite[i] → legacy prixUnitaire → 0.
 */
export function getPrixAchat(line: LineItem, index: number): number {
  const arr = line.prixParQuantite;
  if (Array.isArray(arr) && index >= 0 && index < arr.length) {
    const v = Number(arr[index]);
    if (Number.isFinite(v)) return v;
  }
  const legacy = Number(line.prixUnitaire);
  return Number.isFinite(legacy) ? legacy : 0;
}

/**
 * Ensure a line's `prixParQuantite` has exactly `count` entries.
 * Missing values are filled with the last known price, or the legacy
 * `prixUnitaire`, or 0. Extra entries are truncated.
 */
export function reshapePrixParQuantite(
  line: { prixParQuantite?: number[]; prixUnitaire?: number },
  count: number,
): number[] {
  const arr = Array.isArray(line.prixParQuantite) ? line.prixParQuantite.map(Number) : [];
  const legacy = Number(line.prixUnitaire) || 0;
  while (arr.length < count) {
    arr.push(arr.length > 0 ? arr[arr.length - 1] : legacy);
  }
  arr.length = count;
  return arr.map((v) => (Number.isFinite(v) ? v : 0));
}

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
