// Shared calculation types

/**
 * Quantity scenario with an optional per-quantity margin override (%).
 * If margePct is null/undefined, the default calc margin is used.
 */
export type Quantite = {
  qty: number;
  margePct?: number | null;
  /** Contra: true when the user explicitly confirmed a margin different from the standard. */
  margeConfirmed?: boolean;
};

/** Backward-compat: normalize legacy `number[]` payloads to `Quantite[]`. */
export function normalizeQuantites(input: unknown): Quantite[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => {
      if (typeof v === "number") return { qty: v, margePct: null, margeConfirmed: false };
      if (v && typeof v === "object" && "qty" in (v as any)) {
        const q = (v as any).qty;
        const m = (v as any).margePct;
        return {
          qty: Number(q) || 0,
          margePct: m === undefined || m === null || m === "" ? null : Number(m),
          margeConfirmed: (v as any).margeConfirmed === true,
        };
      }
      return { qty: 0, margePct: null, margeConfirmed: false };
    })
    .filter((q) => q.qty > 0 || q.qty === 0);
}

export type LineItem = {
  fournisseur?: string;
  libelle: string;
  /** Displays this line separately in the Options section of the client offer. */
  isOption?: boolean;
  /** Client-facing description shown in generated offers when filled. */
  descriptif?: string;
  /** Internal note saved with the dossier, never used in calculations. */
  commentaire?: string;
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
  /**
   * Optional line-level transport amount per quantity column.
   * These are global amounts for the line/scenario, divided by the quantity.
   */
  transportParQuantite?: number[];
  /**
   * Optional margin per quantity column. Overrides the line margin only for
   * the matching quantity column.
   */
  margeParQuantite?: Array<number | null>;
  /** Contra: confirmation flags aligned with `margeParQuantite`. */
  margeParQuantiteConfirmed?: boolean[];
  /** Optional per-line margin (%). Overrides quantity + default margin. */
  margePct?: number | null;
  /** Contra: true when the user explicitly confirmed a margin different from the standard. */
  margeConfirmed?: boolean;
  /**
   * Quantity columns proposed for this article, aligned with `quantites`.
   * Missing on legacy dossiers means every quantity remains available.
   */
  quantitesActives?: boolean[];
};

export type LineForfait = {
  fournisseur?: string;
  libelle: string;
  /** Displays this line separately in the Options section of the client offer. */
  isOption?: boolean;
  /** Client-facing description shown in generated offers when filled. */
  descriptif?: string;
  /** Internal note saved with the dossier, never used in calculations. */
  commentaire?: string;
  montantGlobal: number; // divided by quantité
  /** Optional per-line margin (%). Overrides quantity + default margin. */
  margePct?: number | null;
  /** Contra: true when the user explicitly confirmed a margin different from the standard. */
  margeConfirmed?: boolean;
};

/**
 * Explicit option flag used by current dossiers, with label detection kept for
 * dossiers created before the flag existed.
 */
export function isOptionLine(line: { isOption?: boolean; libelle?: unknown } | null | undefined) {
  if (typeof line?.isOption === "boolean") return line.isOption;
  const label = String(line?.libelle ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\boptions?\b/.test(label);
}

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

/** Legacy lines without an explicit selection are available for every quantity. */
export function isLineActiveForQuantity(
  line: Pick<LineItem, "quantitesActives"> | null | undefined,
  index: number,
): boolean {
  if (!Array.isArray(line?.quantitesActives)) return true;
  return line.quantitesActives[index] === true;
}

/** Align a line's quantity selection with the dossier quantity columns. */
export function reshapeQuantitesActives(line: LineItem, count: number): boolean[] {
  if (!Array.isArray(line.quantitesActives)) {
    return Array.from({ length: count }, () => true);
  }
  const arr = line.quantitesActives.slice(0, count).map((value) => value === true);
  while (arr.length < count) arr.push(false);
  return arr;
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

/** Resolve line-level transport as a global amount for a quantity column. */
export function getTransportLigneGlobal(line: LineItem, index: number): number {
  const arr = line.transportParQuantite;
  if (Array.isArray(arr) && index >= 0 && index < arr.length) {
    const v = Number(arr[index]);
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

/** Resolve line-level transport as a unit amount for a quantity column. */
export function getTransportLigneUnit(line: LineItem, index: number, quantity: number): number {
  const global = getTransportLigneGlobal(line, index);
  return quantity > 0 ? global / quantity : 0;
}

/** Ensure a line's `transportParQuantite` has exactly `count` entries. */
export function reshapeTransportParQuantite(line: LineItem, count: number): number[] {
  const arr = Array.isArray(line.transportParQuantite) ? line.transportParQuantite.map(Number) : [];
  while (arr.length < count) arr.push(0);
  arr.length = count;
  return arr.map((v) => (Number.isFinite(v) ? v : 0));
}

/** Resolve the optional line margin for one quantity column. */
export function getMargeParQuantite(line: LineItem, index: number): number | null {
  const arr = line.margeParQuantite;
  if (Array.isArray(arr) && index >= 0 && index < arr.length) {
    const v = arr[index] as unknown;
    if (v !== null && v !== undefined && v !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Resolve the Contra confirmation flag for one quantity-column margin. */
export function getMargeParQuantiteConfirmed(line: LineItem, index: number): boolean {
  const arr = line.margeParQuantiteConfirmed;
  return Array.isArray(arr) && index >= 0 && index < arr.length && arr[index] === true;
}

/** Ensure a line's `margeParQuantite` has exactly `count` entries. */
export function reshapeMargeParQuantite(line: LineItem, count: number): Array<number | null> {
  const arr = Array.isArray(line.margeParQuantite)
    ? line.margeParQuantite.map((v) => {
        const raw = v as unknown;
        if (raw === null || raw === undefined || raw === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })
    : [];
  while (arr.length < count) arr.push(null);
  arr.length = count;
  return arr;
}

/** Ensure Contra confirmation flags are aligned with quantity-column margins. */
export function reshapeMargeParQuantiteConfirmed(line: LineItem, count: number): boolean[] {
  const arr = Array.isArray(line.margeParQuantiteConfirmed)
    ? line.margeParQuantiteConfirmed.map((v) => v === true)
    : [];
  while (arr.length < count) arr.push(false);
  arr.length = count;
  return arr;
}

export type AmountPricingMode = "global" | "per_quantity";

/** Transport / Packaging: one quote-wide amount or one amount per quantity scenario. */
export type TransportPackaging = {
  montantsGlobaux: number[];
  /** One amount for the whole quote, reused and divided by each scenario quantity. */
  montantGlobal?: number;
  /** Legacy dossiers without this field remain in per-quantity mode. */
  pricingMode?: AmountPricingMode;
  /** Client-facing flag: transport is already included in supplier prices. */
  transportInclus?: boolean;
  /** Client-facing condition. Legacy dossiers with transportInclus=true resolve to "inclus". */
  mode?: "global" | "inclus" | "depart_ateliers";
  /** Department displayed when the offer is priced from Yeti workshops. */
  departementDepart?: string;
  /** Optional margin override (%). Each calculator defines the empty-value fallback. */
  margePct?: number | null;
  /** Contra: true when the user explicitly confirmed a margin different from the standard. */
  margeConfirmed?: boolean;
};

/** Backward-compat + shape normalization. */
export function normalizeTransportPackaging(input: unknown, count: number): TransportPackaging {
  const o = input && typeof input === "object" ? (input as any) : {};
  const rawMode = String(o.mode ?? "").trim();
  const mode =
    rawMode === "inclus" || rawMode === "depart_ateliers"
      ? rawMode
      : o.transportInclus === true || o.transportInclus === "true"
        ? "inclus"
        : "global";
  const raw = Array.isArray(o.montantsGlobaux) ? o.montantsGlobaux : [];
  const arr: number[] = raw.map((v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
  while (arr.length < count) arr.push(0);
  arr.length = count;
  const globalRaw = Number(o.montantGlobal);
  const hasLegacyDetailedAmounts = arr.some((value) => Math.abs(value) >= 0.005);
  const pricingMode: AmountPricingMode =
    o.pricingMode === "global" || o.pricingMode === "per_quantity"
      ? o.pricingMode
      : Number.isFinite(globalRaw)
        ? "global"
        : hasLegacyDetailedAmounts
          ? "per_quantity"
          : "global";
  const m = o.margePct;
  return {
    montantsGlobaux: arr,
    montantGlobal: Number.isFinite(globalRaw) ? globalRaw : 0,
    pricingMode,
    transportInclus:
      mode === "inclus" || o.transportInclus === true || o.transportInclus === "true",
    mode,
    departementDepart: String(o.departementDepart ?? "").trim(),
    margePct: m === undefined || m === null || m === "" ? null : Number(m),
    margeConfirmed: o.margeConfirmed === true,
  };
}

/** Total transport amount to use for one scenario before division by its quantity. */
export function getTransportPackagingGlobal(value: TransportPackaging, index: number): number {
  if (value.mode && value.mode !== "global") return 0;
  const raw =
    value.pricingMode === "global"
      ? Number(value.montantGlobal)
      : Number(value.montantsGlobaux[index]);
  return Number.isFinite(raw) ? raw : 0;
}

/**
 * Outillage: one fixed quote-wide amount or one total amount per quantity scenario.
 */
export type Outillage = {
  montantGlobal: number;
  montantsParQuantite?: number[];
  pricingMode?: AmountPricingMode;
  /** Optional margin override (%). Each calculator defines the empty-value fallback. */
  margePct?: number | null;
  /** Contra: true when the user explicitly confirmed a margin different from the standard. */
  margeConfirmed?: boolean;
};

/** Backward-compat + shape normalization. */
export function normalizeOutillage(input: unknown, count = 0): Outillage {
  const o = input && typeof input === "object" ? (input as any) : {};
  const raw = Number(o.montantGlobal);
  const perQuantity = Array.isArray(o.montantsParQuantite)
    ? o.montantsParQuantite.map((value: unknown) => {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
      })
    : [];
  while (perQuantity.length < count) perQuantity.push(0);
  if (count > 0) perQuantity.length = count;
  const m = o.margePct;
  return {
    montantGlobal: Number.isFinite(raw) ? raw : 0,
    montantsParQuantite: perQuantity,
    pricingMode: o.pricingMode === "per_quantity" ? "per_quantity" : "global",
    margePct: m === undefined || m === null || m === "" ? null : Number(m),
    margeConfirmed: o.margeConfirmed === true,
  };
}

/** Total tooling amount to use for one scenario before division by its quantity. */
export function getOutillageGlobal(value: Outillage, index: number): number {
  const raw =
    value.pricingMode === "per_quantity"
      ? Number(value.montantsParQuantite?.[index])
      : Number(value.montantGlobal);
  return Number.isFinite(raw) ? raw : 0;
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
  transportPackagingUnit?: number;
  transportPackagingGlobal?: number;
  /** True when Transport / Packaging is billed to the client without any margin. */
  transportPackagingSansMarge?: boolean;
  /** Effective margin (%) applied to Transport / Packaging (0 when "sans marge"). */
  transportPackagingMargePct?: number;
  transportLignesUnit?: number;
  transportLignesGlobal?: number;
  outillageUnit?: number;
  outillageGlobal?: number;
  /** True when Outillage is billed to the client without any margin. */
  outillageSansMarge?: boolean;
  /** Effective margin (%) applied to Outillage (0 when "sans marge"). */
  outillageMargePct?: number;
  totalPrixUnitaire: number;
  totalCA: number;
  totalDepenses: number;
  margeNet: number;
  margePct: number;
  alerteMarge: boolean;
  // optional Contra-specific
  margeContra?: number;
  margeContraPct?: number;
  /** Bon de commande Contra — details visible on screen & PDF. */
  contraCoefPct?: number;
  contraAchatBrutUnit?: number;
  contraForfaitUnit?: number;
  contraTransportUnit?: number;
  contraOutillageUnit?: number;
  contraBaseUnit?: number;
  contraPrixFactureUnit?: number;
  contraPrixFactureGlobal?: number;
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

/** Resolve effective line margin with priority: cell > line > quantity > default. */
export function resolveLineMargePct(
  line: LineItem,
  quantityIndex: number,
  quantiteMarge: number | null | undefined,
  defaultMarge: number,
): number {
  const cellMarge = getMargeParQuantite(line, quantityIndex);
  const lineMarge =
    line.margePct !== null && line.margePct !== undefined && !Number.isNaN(line.margePct)
      ? line.margePct
      : null;
  return resolveMargePct(cellMarge, lineMarge, resolveMargePct(null, quantiteMarge, defaultMarge));
}
