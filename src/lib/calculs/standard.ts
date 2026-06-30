import type { LineItem, LineForfait, QuantityResult, CalcOutput } from "./types";

export type StandardParams = {
  coef_marge_pct: number;
  frais_fixes_pct: number;
  commission_sourcing: boolean;
  commission_sourcing_pct: number;
  commission_sourcing_min_eur: number;
  commission_rapporteur_pct: number;
  seuil_alerte_marge_pct: number;
};

export type StandardInput = {
  quantites: number[];
  achatsPrincipaux: LineItem[];
  achatsAnnexes: LineForfait[];
  params: StandardParams;
};

export const STANDARD_DEFAULTS: StandardParams = {
  coef_marge_pct: 33.33,
  frais_fixes_pct: 4,
  commission_sourcing: true,
  commission_sourcing_pct: 5,
  commission_sourcing_min_eur: 200,
  commission_rapporteur_pct: 0,
  seuil_alerte_marge_pct: 20,
};

export function calculerStandard(input: StandardInput): CalcOutput {
  const { quantites, achatsPrincipaux, achatsAnnexes, params } = input;
  const sumPrincipaux = achatsPrincipaux.reduce((s, l) => s + (Number(l.prixUnitaire) || 0), 0);
  const sumAnnexesGlobal = achatsAnnexes.reduce((s, l) => s + (Number(l.montantGlobal) || 0), 0);

  const scenarios: QuantityResult[] = quantites.map((q) => {
    const Q = Number(q) || 0;
    const annexesUnit = Q > 0 ? sumAnnexesGlobal / Q : 0;
    const baseAchatUnit = sumPrincipaux + annexesUnit;

    let commSourcingUnit = 0;
    if (params.commission_sourcing && Q > 0) {
      const pct = params.commission_sourcing_pct / 100;
      const commTotal = baseAchatUnit * pct * Q;
      commSourcingUnit =
        commTotal >= params.commission_sourcing_min_eur
          ? baseAchatUnit * pct
          : params.commission_sourcing_min_eur / Q;
    }

    const prixUnitaireAchat = baseAchatUnit + commSourcingUnit;
    const prixVenteNetUnit = prixUnitaireAchat * (1 + params.coef_marge_pct / 100);
    const achatsTotal = prixUnitaireAchat * Q;
    const fraisFixes = achatsTotal * (params.frais_fixes_pct / 100);
    const budgetNet = prixVenteNetUnit * Q;
    const commRapUnit = prixVenteNetUnit * (params.commission_rapporteur_pct / 100);
    const commRapTotal = commRapUnit * Q;
    const totalPrixUnitaire = prixVenteNetUnit + commRapUnit + (Q > 0 ? fraisFixes / Q : 0);
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
      commissionSourcingUnit: commSourcingUnit,
      commissionRapporteurUnit: commRapUnit,
      commissionRapporteurTotal: commRapTotal,
      totalPrixUnitaire,
      totalCA,
      totalDepenses,
      margeNet,
      margePct,
      alerteMarge: margePct < params.seuil_alerte_marge_pct / 100,
    };
  });

  return {
    scenarios,
    totalMargeNet: scenarios.reduce((s, r) => s + r.margeNet, 0),
    totalCA: scenarios.reduce((s, r) => s + r.totalCA, 0),
  };
}
