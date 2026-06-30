import type { LineItem, LineForfait, QuantityResult, CalcOutput } from "./types";

export type ContraParams = {
  coef_contra_pct: number;
  coef_autres_pct: number;
  frais_fixes_pct: number;
  commission_sourcing: boolean;
  commission_sourcing_pct: number;
  commission_sourcing_min_eur: number;
  commission_rapporteur_pct: number;
};

export type ContraInput = {
  quantites: number[];
  achatsContra: LineItem[];
  forfaitsContra: LineForfait[];
  achatsAutres: LineItem[];
  params: ContraParams;
};

export const CONTRA_DEFAULTS: ContraParams = {
  coef_contra_pct: 25,
  coef_autres_pct: 33.33,
  frais_fixes_pct: 4,
  commission_sourcing: false,
  commission_sourcing_pct: 5,
  commission_sourcing_min_eur: 200,
  commission_rapporteur_pct: 0,
};

export function calculerContra(input: ContraInput): CalcOutput {
  const { quantites, achatsContra, forfaitsContra, achatsAutres, params } = input;
  const sumContraUnit = achatsContra.reduce((s, l) => s + (Number(l.prixUnitaire) || 0), 0);
  const sumContraForfait = forfaitsContra.reduce((s, l) => s + (Number(l.montantGlobal) || 0), 0);
  const sumAutresUnit = achatsAutres.reduce((s, l) => s + (Number(l.prixUnitaire) || 0), 0);

  const scenarios: QuantityResult[] = quantites.map((q) => {
    const Q = Number(q) || 0;
    const contraUnit = sumContraUnit + (Q > 0 ? sumContraForfait / Q : 0);

    let commSourcingUnit = 0;
    if (params.commission_sourcing && Q > 0) {
      const pct = params.commission_sourcing_pct / 100;
      const commTotal = sumAutresUnit * pct * Q;
      commSourcingUnit =
        commTotal >= params.commission_sourcing_min_eur
          ? sumAutresUnit * pct
          : params.commission_sourcing_min_eur / Q;
    }
    const autresUnit = sumAutresUnit + commSourcingUnit;

    const pvUnitContra = contraUnit * (1 + params.coef_contra_pct / 100);
    const pvUnitAutres = autresUnit * (1 + params.coef_autres_pct / 100);
    const prixVenteNetUnit = pvUnitContra + pvUnitAutres;

    const prixUnitaireAchat = contraUnit + autresUnit;
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

    const caContra = pvUnitContra * Q;
    const achContra = contraUnit * Q;
    const caAutres = pvUnitAutres * Q;
    const achAutres = autresUnit * Q;

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
      alerteMarge: margePct < 0.2,
      margeContra: caContra - achContra,
      margeContraPct: caContra > 0 ? (caContra - achContra) / caContra : 0,
      margeAutres: caAutres - achAutres,
      margeAutresPct: caAutres > 0 ? (caAutres - achAutres) / caAutres : 0,
    };
  });

  return {
    scenarios,
    totalMargeNet: scenarios.reduce((s, r) => s + r.margeNet, 0),
    totalCA: scenarios.reduce((s, r) => s + r.totalCA, 0),
  };
}
