import type {
  LineItem,
  LineForfait,
  QuantityResult,
  CalcOutput,
  Quantite,
  TransportPackaging,
} from "./types";
import {
  normalizeQuantites,
  normalizeTransportPackaging,
  resolveMargePct,
  getPrixAchat,
} from "./types";

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
  transportPackaging?: TransportPackaging;
  /** @deprecated legacy field kept for old dossiers — ignored by calc. */
  achatsAutres?: LineItem[];
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
  const { achatsContra, forfaitsContra, params } = input;
  const quantites = normalizeQuantites(input.quantites);
  const tp = normalizeTransportPackaging(input.transportPackaging, quantites.length);
  const sumContraForfait = forfaitsContra.reduce((s, l) => s + (Number(l.montantGlobal) || 0), 0);

  const scenarios: QuantityResult[] = quantites.map((quant, qi) => {
    const Q = Number(quant.qty) || 0;
    const mq = quant.margePct;
    const sumContraUnit = achatsContra.reduce((s, l) => s + getPrixAchat(l, qi), 0);
    const forfaitUnit = Q > 0 ? sumContraForfait / Q : 0;
    const contraUnit = sumContraUnit + forfaitUnit;
    const tpGlobal = Number(tp.montantsGlobaux[qi]) || 0;
    const tpUnit = Q > 0 ? tpGlobal / Q : 0;

    let commSourcingUnit = 0;
    if (params.commission_sourcing && Q > 0) {
      const pct = params.commission_sourcing_pct / 100;
      const commTotal = tpUnit * pct * Q;
      commSourcingUnit =
        commTotal >= params.commission_sourcing_min_eur
          ? tpUnit * pct
          : params.commission_sourcing_min_eur / Q;
    }

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

    // Transport / Packaging uses "autres" default margin (or block override).
    const mTP = resolveMargePct(tp.margePct, mq, params.coef_autres_pct);
    const pvUnitTP = tpUnit * (1 + mTP / 100);
    const mSourcing = resolveMargePct(null, mq, params.coef_autres_pct);
    const pvUnitSourcing = commSourcingUnit * (1 + mSourcing / 100);

    const prixVenteNetUnit = pvUnitContra + pvUnitTP + pvUnitSourcing;
    const prixUnitaireAchat = contraUnit + tpUnit + commSourcingUnit;
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

    return {
      quantite: Q,
      prixUnitaireAchat,
      prixVenteNetUnit,
      achatsTotal,
      fraisFixes,
      commissionSourcingUnit: commSourcingUnit,
      commissionRapporteurUnit: commRapUnit,
      commissionRapporteurTotal: commRapTotal,
      transportPackagingUnit: tpUnit,
      transportPackagingGlobal: tpGlobal,
      totalPrixUnitaire,
      totalCA,
      totalDepenses,
      margeNet,
      margePct,
      alerteMarge: margePct < 0.2,
      margeContra: caContra - achContra,
      margeContraPct: caContra > 0 ? (caContra - achContra) / caContra : 0,
    };
  });

  return {
    scenarios,
    totalMargeNet: scenarios.reduce((s, r) => s + r.margeNet, 0),
    totalCA: scenarios.reduce((s, r) => s + r.totalCA, 0),
  };
}
