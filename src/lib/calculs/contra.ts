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
   * Non pris en compte tant que `coef_contra_confirmed !== true` : on retombe
   * alors sur l'accord standard Contra/Yeti (25 % / 25 %).
   */
  coef_contra_pct: number;
  /** true quand l'utilisateur a explicitement confirmé un coef différent de 25 %. */
  coef_contra_confirmed?: boolean;
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

/** Accord standard Contra/Yeti : 25 % pour Contra, 25 % pour Yeti. */
export const CONTRA_STANDARD_MARGE_PCT = 25;

/**
 * Marge effective : la valeur saisie ne compte que si elle a été explicitement
 * confirmée par l'utilisateur. Sinon on force l'accord standard (25 %).
 */
export function effectiveContraMarge(
  margePct: number | null | undefined,
  margeConfirmed: boolean | undefined,
): number | null {
  if (margeConfirmed !== true) return null;
  const n = Number(margePct);
  return Number.isFinite(n) ? n : null;
}

/** Coefficient Contra effectif (25 % sauf modification confirmée). */
export function effectiveContraCoefPct(params: ContraParams): number {
  if (params?.coef_contra_confirmed !== true) return CONTRA_STANDARD_MARGE_PCT;
  const n = Number(params.coef_contra_pct);
  return Number.isFinite(n) ? n : CONTRA_STANDARD_MARGE_PCT;
}

/**
 * Marge Yeti effective pour une ligne / un forfait / le Transport-Packaging.
 * Priorité stricte :
 *   marge ligne CONFIRMÉE > marge quantité CONFIRMÉE > accord standard 25 %.
 * Les marges non confirmées (anciens dossiers à 33,33 % par exemple) sont
 * simplement ignorées : elles n'écrasent jamais le niveau supérieur.
 */
export function resolveContraMargePct(
  lineMarge: number | null | undefined,
  lineConfirmed: boolean | undefined,
  quantityMarge: number | null | undefined,
  quantityConfirmed: boolean | undefined,
): number {
  const line = effectiveContraMarge(lineMarge, lineConfirmed);
  if (line !== null) return line;
  const quantity = effectiveContraMarge(quantityMarge, quantityConfirmed);
  if (quantity !== null) return quantity;
  return CONTRA_STANDARD_MARGE_PCT;
}

/**
 * Normalise uniquement le coefficient Contra (25 % sauf modification
 * confirmée). Les marges des lignes/quantités/T-P sont laissées telles quelles :
 * leur résolution passe par `resolveContraMargePct`, qui respecte la priorité
 * ligne confirmée > quantité confirmée > 25 %.
 */
export function sanitizeContraInput(input: ContraInput): ContraInput {
  return {
    ...input,
    params: { ...input.params, coef_contra_pct: effectiveContraCoefPct(input.params) },
  };
}


export const CONTRA_DEFAULTS: ContraParams = {
  coef_contra_pct: CONTRA_STANDARD_MARGE_PCT,
  coef_contra_confirmed: false,
  coef_autres_pct: 33.33,
  frais_fixes_pct: 4,
  commission_sourcing: false,
  commission_sourcing_pct: 5,
  commission_sourcing_min_eur: 200,
  commission_rapporteur_pct: 0,
};

function truncatePct(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.trunc(value * factor) / factor;
}

/**
 * Mode historique du tableur Contra : on transforme le partage Contra/Yeti
 * en coefficient global sur le brut, tronqué à 3 décimales (ex. 66,666 %).
 */
export function pvFromContraSharedRaw(
  rawCost: number,
  contraPct: number,
  margePct: number,
): number {
  const m = Math.max(0, Math.min(99, Number(margePct) || 0));
  const contraFactor = 1 + (Number(contraPct) || 0) / 100;
  const totalMarkupPct = (contraFactor / (1 - m / 100) - 1) * 100;
  return rawCost * (1 + truncatePct(totalMarkupPct) / 100);
}

export function calculerContra(rawInput: ContraInput): CalcOutput {
  // Seul le coefficient Contra est normalisé ici ; les marges suivent la
  // priorité ligne confirmée > quantité confirmée > 25 %.
  const input = sanitizeContraInput(rawInput);
  const { achatsContra, forfaitsContra, params } = input;

  const quantites = normalizeQuantites(input.quantites);
  const tp = normalizeTransportPackaging(input.transportPackaging, quantites.length);
  const sumForfaitsGlobal = forfaitsContra.reduce((s, l) => s + (Number(l.montantGlobal) || 0), 0);
  const coefContra = params.coef_contra_pct; // markup Contra
  const contraFactor = 1 + coefContra / 100;

  const scenarios: QuantityResult[] = quantites.map((quant, qi) => {
    const Q = Number(quant.qty) || 0;
    const mq = quant.margePct;
    const mqConfirmed = quant.margeConfirmed;

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

    // 4) Prix de vente client Yeti — mode Excel historique Contra.
    //    Par ligne : brut × coefficient global Contra/Yeti tronqué à 3 décimales.
    let pvUnitAchats = 0;
    for (const l of achatsContra) {
      const raw = getPrixAchat(l, qi);
      const mYeti = resolveContraMargePct(l.margePct, l.margeConfirmed, mq, mqConfirmed);
      pvUnitAchats += pvFromContraSharedRaw(raw, coefContra, mYeti);
    }
    let pvUnitForfaits = 0;
    for (const f of forfaitsContra) {
      const share = Q > 0 ? (Number(f.montantGlobal) || 0) / Q : 0;
      const mYeti = resolveContraMargePct(f.margePct, f.margeConfirmed, mq, mqConfirmed);
      pvUnitForfaits += pvFromContraSharedRaw(share, coefContra, mYeti);
    }

    // Transport / Packaging participe au même partage Contra/Yeti :
    // marge T/P confirmée > marge quantité confirmée > 25 %.
    const mTP = resolveContraMargePct(tp.margePct, tp.margeConfirmed, mq, mqConfirmed);
    const pvUnitTP = pvFromContraSharedRaw(tpUnit, coefContra, mTP);


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
      transportPackagingSansMarge: false,
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
