import type { LineItem, LineForfait, QuantityResult, CalcOutput, Quantite } from "./types";
import { normalizeQuantites, resolveMargePct, getPrixAchat } from "./types";

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
  quantites: Quantite[];
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
  const { achatsContra, forfaitsContra, achatsAutres, params } = input;
  const quantites = normalizeQuantites(input.quantites);
  const sumContraForfait = forfaitsContra.reduce((s, l) => s + (Number(l.montantGlobal) || 0), 0);

  const scenarios: QuantityResult[] = quantites.map((quant, qi) => {
    const Q = Number(quant.qty) || 0;
    const mq = quant.margePct;
    const sumContraUnit = achatsContra.reduce((s, l) => s + getPrixAchat(l, qi), 0);
    const sumAutresUnit = achatsAutres.reduce((s, l) => s + getPrixAchat(l, qi), 0);
    const forfaitUnit = Q > 0 ? sumContraForfait / Q : 0;
    const contraUnit = sumContraUnit + forfaitUnit;

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

    // Per-line PV: priority line > quantity > family default
    let pvUnitContra = 0;
    for (const l of achatsContra) {
      const m = resolveMargePct(l.margePct, mq, params.coef_contra_pct);
      pvUnitContra += getPrixAchat(l, qi) * (1 + m / 100);
    }
    for (const f of forfaitsContra) {
      const share = Q > 0 ? (Number(f.montantGlobal) || 0) / Q : 0;
      const m = resolveMargePct(f.margePct, mq, params.coef_contra_pct);
      pvUnitContra += share * (1 + m / 100);
    }

    let pvUnitAutres = 0;
    for (const l of achatsAutres) {
      const m = resolveMargePct(l.margePct, mq, params.coef_autres_pct);
      pvUnitAutres += getPrixAchat(l, qi) * (1 + m / 100);
    }
    // Sourcing commission uses quantity/default (autres family default)
    const mSourcing = resolveMargePct(null, mq, params.coef_autres_pct);
    pvUnitAutres += commSourcingUnit * (1 + mSourcing / 100);

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
