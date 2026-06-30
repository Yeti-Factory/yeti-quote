import type { QuantityResult, CalcOutput } from "./types";

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
  libelle: string; // ex "Sol", "Menuiserie - mobilier", "Électricité", "Logistique", "Décors", "Options"
  lignes: StandsSectionLine[];
};

export type StandsInput = {
  quantites: number[];
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
  "Menuiserie - mobilier",
  "Divers",
  "Électricité",
  "Logistique",
  "Décors / Communication",
  "Options",
];

export function calculerStands(input: StandsInput): CalcOutput {
  const { quantites, sections, params } = input;
  const sumAchatUnit = sections.reduce(
    (s, sec) => s + sec.lignes.reduce((a, l) => a + (Number(l.prixUnitaire) || 0), 0),
    0,
  );
  const facteurPV =
    (1 + params.coef_marge_pct / 100) * (1 + params.marge_crea_pct / 100);

  const scenarios: QuantityResult[] = quantites.map((q) => {
    const Q = Number(q) || 0;
    const prixUnitaireAchat = sumAchatUnit;
    const prixVenteNetUnit = sumAchatUnit * facteurPV;
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
  };
}
