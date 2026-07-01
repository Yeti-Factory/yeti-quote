import type { QuantityResult, CalcOutput, Quantite } from "./types";
import { normalizeQuantites, resolveMargePct } from "./types";

export type StandsParams = {
  coef_marge_pct: number;
  frais_fixes_pct: number;
  marge_crea_pct: number;
  commission_rapporteur_pct: number;
};

export type StandsSectionLine = {
  libelle: string;
  prixUnitaire: number; // achat unitaire
};

export type StandsSection = {
  libelle: string;
  lignes: StandsSectionLine[];
  /** Marge groupe (%) — overrides default coef_marge_pct when set. */
  margePct?: number | null;
};

export type StandsInput = {
  quantites: Quantite[];
  sections: StandsSection[];
  params: StandsParams;
};

export const STANDS_DEFAULTS: StandsParams = {
  coef_marge_pct: 33.33,
  frais_fixes_pct: 4,
  marge_crea_pct: 0,
  commission_rapporteur_pct: 10,
};

export const STANDS_SECTIONS_DEFAUT = [
  "Sol",
  "Menuiseries",
  "Éclairage",
  "Mobilier",
  "Décors / Communication",
  "Transport",
  "Pose",
  "Options",
];

export type StandsGroupResult = {
  libelle: string;
  achatTotal: number;
  margePct: number;
  pvTotal: number;
};

export type StandsExtra = {
  groupes: StandsGroupResult[];
  totalAchatGroupes: number;
  totalPvGroupes: number;
};

export function calculerStands(input: StandsInput): CalcOutput & { extra: StandsExtra } {
  const { sections, params } = input;
  const quantites = normalizeQuantites(input.quantites);

  // Per-group results (independent of quantity — stands are typically 1 unit)
  const groupes: StandsGroupResult[] = sections.map((sec) => {
    const achatTotal = sec.lignes.reduce((a, l) => a + (Number(l.prixUnitaire) || 0), 0);
    const margePct = resolveMargePct(sec.margePct, null, params.coef_marge_pct);
    // creation extra applies globally
    const facteur = (1 + margePct / 100) * (1 + params.marge_crea_pct / 100);
    const pvTotal = achatTotal * facteur;
    return { libelle: sec.libelle, achatTotal, margePct, pvTotal };
  });

  const totalAchatGroupes = groupes.reduce((s, g) => s + g.achatTotal, 0);
  const totalPvGroupes = groupes.reduce((s, g) => s + g.pvTotal, 0);

  const scenarios: QuantityResult[] = (
    quantites.length ? quantites : [{ qty: 1, margePct: null }]
  ).map((quant) => {
    const Q = Number(quant.qty) || 0;
    const prixUnitaireAchat = totalAchatGroupes;
    const prixVenteNetUnit = totalPvGroupes;
    const achatsTotal = prixUnitaireAchat * Q;
    const fraisFixes = achatsTotal * (params.frais_fixes_pct / 100);
    const budgetNet = prixVenteNetUnit * Q;
    const commRapUnit = prixVenteNetUnit * (params.commission_rapporteur_pct / 100);
    const commRapTotal = commRapUnit * Q;
    const totalPrixUnitaire = prixVenteNetUnit + commRapUnit;
    const totalCA = totalPrixUnitaire * Q;
    const totalDepenses = achatsTotal + commRapTotal + fraisFixes;
    const margeNet = totalCA - totalDepenses;
    const margePct = budgetNet > 0 ? margeNet / budgetNet : 0;

    return {
      quantite: Q,
      prixUnitaireAchat,
      prixVenteNetUnit,
      achatsTotal,
      fraisFixes,
      commissionSourcingUnit: 0,
      commissionRapporteurUnit: commRapUnit,
      commissionRapporteurTotal: commRapTotal,
      totalPrixUnitaire,
      totalCA,
      totalDepenses,
      margeNet,
      margePct,
      alerteMarge: margePct < 0.2,
    };
  });

  return {
    scenarios,
    totalMargeNet: scenarios.reduce((s, r) => s + r.margeNet, 0),
    totalCA: scenarios.reduce((s, r) => s + r.totalCA, 0),
    extra: { groupes, totalAchatGroupes, totalPvGroupes },
  };
}
