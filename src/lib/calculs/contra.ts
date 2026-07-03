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
  /**
   * Coefficient Contra (%) — sert de DOUBLE usage :
   *  1) taux de marge que Contra applique sur le "Bon de commande Contra"
   *     (prix facturé Contra = base × (1 + coef/100))
   *  2) taux de marge résiduelle cible pour Yeti (par défaut, sauf override
   *     par ligne ou par quantité).
   */
  coef_contra_pct: number;
  /** @deprecated ancien coef "Autres". Conservé pour compat, non utilisé. */
  coef_autres_pct: number;
  frais_fixes_pct: number;
  commission_sourcing: boolean;
  commission_sourcing_pct: number;
  commission_sourcing_min_eur: number;
  commission_rapporteur_pct: number;
};

export type ContraInput = {
  quantites: Quantite[];
  /** Prix d'achat BRUTS transmis par Contra — n'incluent PAS la marge Contra. */
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

/** Marge résiduelle : PV = coût / (1 - m/100). Clamp m dans [0, 99]. */
function pvFromResidual(cost: number, margePct: number): number {
  const m = Math.max(0, Math.min(99, Number(margePct) || 0));
  return cost / (1 - m / 100);
}

export function calculerContra(input: ContraInput): CalcOutput {
  const { achatsContra, forfaitsContra, params } = input;
  const quantites = normalizeQuantites(input.quantites);
  const tp = normalizeTransportPackaging(input.transportPackaging, quantites.length);
  const sumForfaitsGlobal = forfaitsContra.reduce((s, l) => s + (Number(l.montantGlobal) || 0), 0);
  const coefContra = params.coef_contra_pct; // markup Contra
  const contraFactor = 1 + coefContra / 100;

  const scenarios: QuantityResult[] = quantites.map((quant, qi) => {
    const Q = Number(quant.qty) || 0;
    const mq = quant.margePct;

    // 1) Bases BRUTES transmises par Contra
    const rawAchatUnit = achatsContra.reduce((s, l) => s + getPrixAchat(l, qi), 0);
    const rawForfaitUnit = Q > 0 ? sumForfaitsGlobal / Q : 0;
    const tpGlobal = Number(tp.montantsGlobaux[qi]) || 0;
    const tpUnit = Q > 0 ? tpGlobal / Q : 0;

    // 2) Bon de commande Contra — Contra prend sa marge sur (achats + forfaits + TP)
    const baseUnitContra = rawAchatUnit + rawForfaitUnit + tpUnit;
    const prixFactureContraUnit = baseUnitContra * contraFactor;
    const prixFactureContraGlobal = prixFactureContraUnit * Q;

    // 3) Commission sourcing (basée sur le prix facturé Contra)
    let commSourcingUnit = 0;
    if (params.commission_sourcing && Q > 0) {
      const pct = params.commission_sourcing_pct / 100;
      const commTotal = prixFactureContraUnit * pct * Q;
      commSourcingUnit =
        commTotal >= params.commission_sourcing_min_eur
          ? prixFactureContraUnit * pct
          : params.commission_sourcing_min_eur / Q;
    }

    // 4) Prix de vente client Yeti — marge RÉSIDUELLE (PV = coût / (1 - m/100)).
    //    Par ligne : cost_line = raw_line × (1 + coefContra/100)
    //    puis pv_line = cost_line / (1 - m_yeti/100).
    let pvUnitAchats = 0;
    for (const l of achatsContra) {
      const raw = getPrixAchat(l, qi);
      const cost = raw * contraFactor;
      const mYeti = resolveMargePct(l.margePct, mq, params.coef_contra_pct);
      pvUnitAchats += pvFromResidual(cost, mYeti);
    }
    let pvUnitForfaits = 0;
    for (const f of forfaitsContra) {
      const share = Q > 0 ? (Number(f.montantGlobal) || 0) / Q : 0;
      const cost = share * contraFactor;
      const mYeti = resolveMargePct(f.margePct, mq, params.coef_contra_pct);
      pvUnitForfaits += pvFromResidual(cost, mYeti);
    }

    // Transport / Packaging — Contra prend sa marge, puis Yeti applique sa
    // propre marge résiduelle SEULEMENT si une marge est explicitement saisie
    // (sinon T/P est refacturé au coût, sans marge Yeti).
    const costTP = tpUnit * contraFactor;
    const tpHasMargin = tp.margePct !== null && tp.margePct !== undefined;
    const mTP = tpHasMargin ? Number(tp.margePct) : 0;
    const pvUnitTP = tpHasMargin ? pvFromResidual(costTP, mTP) : costTP;

    // Commission sourcing — refacturée au coût.
    const pvUnitSourcing = commSourcingUnit;

    const prixVenteNetUnit = pvUnitAchats + pvUnitForfaits + pvUnitTP + pvUnitSourcing;

    // Coût réel Yeti = prix facturé Contra + commission sourcing
    const prixUnitaireAchat = prixFactureContraUnit + commSourcingUnit;
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

    // Marge encaissée par Contra sur cette quantité (indicatif)
    const margeContra = prixFactureContraGlobal - baseUnitContra * Q;

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
      alerteMarge: margePct < 0.2,
      margeContra,
      margeContraPct: coefContra / 100,
      // Bon de commande Contra
      contraCoefPct: coefContra,
      contraAchatBrutUnit: rawAchatUnit,
      contraForfaitUnit: rawForfaitUnit,
      contraTransportUnit: tpUnit,
      contraBaseUnit: baseUnitContra,
      contraPrixFactureUnit: prixFactureContraUnit,
      contraPrixFactureGlobal: prixFactureContraGlobal,
    };
  });

  return {
    scenarios,
    totalMargeNet: scenarios.reduce((s, r) => s + r.margeNet, 0),
    totalCA: scenarios.reduce((s, r) => s + r.totalCA, 0),
  };
}
