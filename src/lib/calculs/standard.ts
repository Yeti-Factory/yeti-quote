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
  quantites: Quantite[];
  achatsPrincipaux: LineItem[];
  transportPackaging?: TransportPackaging;
  /** @deprecated legacy field kept for old dossiers — ignored by calc. */
  achatsAnnexes?: LineForfait[];
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
  const { achatsPrincipaux, params } = input;
  const quantites = normalizeQuantites(input.quantites);
  const tp = normalizeTransportPackaging(input.transportPackaging, quantites.length);

  const scenarios: QuantityResult[] = quantites.map((quant, qi) => {
    const Q = Number(quant.qty) || 0;
    const mq = quant.margePct;
    const sumPrincipaux = achatsPrincipaux.reduce((s, l) => s + getPrixAchat(l, qi), 0);
    const tpGlobal = Number(tp.montantsGlobaux[qi]) || 0;
    const tpUnit = Q > 0 ? tpGlobal / Q : 0;
    const baseAchatUnit = sumPrincipaux + tpUnit;

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

    // Per-line PV using effective margin (line > quantity > default).
    let pvUnit = 0;
    for (const l of achatsPrincipaux) {
      const m = resolveMargePct(l.margePct, mq, params.coef_marge_pct);
      pvUnit += getPrixAchat(l, qi) * (1 + m / 100);
    }
    // Transport / Packaging: margin is OPT-IN. Without an explicit margin, it is
    // billed to the client at cost (sans marge).
    const tpHasMargin = tp.margePct !== null && tp.margePct !== undefined;
    const mTP = tpHasMargin ? Number(tp.margePct) : 0;
    pvUnit += tpUnit * (1 + mTP / 100);
    // Sourcing commission → billed at cost (no margin).
    pvUnit += commSourcingUnit;

    const prixVenteNetUnit = pvUnit;
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
      transportPackagingUnit: tpUnit,
      transportPackagingGlobal: tpGlobal,
      transportPackagingSansMarge: !tpHasMargin,
      transportPackagingMargePct: mTP,
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
