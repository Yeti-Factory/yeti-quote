import type { QuantityResult, CalcOutput, Quantite } from "./types";
import { normalizeQuantites, resolveMargePct } from "./types";

export type StandsParams = {
  coef_marge_pct: number;
  frais_fixes_pct: number;
  marge_crea_pct: number;
  commission_rapporteur_pct: number;
};

export type StandsSectionLine = {
  fournisseur?: string;
  libelle: string;
  /** Client-facing description shown in generated offers when filled. */
  descriptif?: string;
  /** Internal note saved with the dossier, never used in calculations. */
  commentaire?: string;
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

export function isGenericStandSectionLabel(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length === 0 || /^groupe\s+\d+$/i.test(text);
}

export function resolveStandsSectionLabel(section: Pick<StandsSection, "libelle">, index: number) {
  const label = String(section?.libelle ?? "").trim();
  if (isGenericStandSectionLabel(label))
    return STANDS_SECTIONS_DEFAUT[index] || `Groupe ${index + 1}`;
  return label;
}

export type StandsGroupResult = {
  libelle: string;
  achatTotal: number;
  margePct: number;
  /** Prix vente avant ventilation des frais fixes, utilisé pour le calcul de marge. */
  pvTotalHorsFrais: number;
  /** Quote-part de frais fixes ventilée sur ce groupe. */
  fraisFixes: number;
  /** Prix vente affiché au client, frais fixes inclus. */
  pvTotal: number;
  lignes: Array<{
    achat: number;
    pvTotalHorsFrais: number;
    fraisFixes: number;
    pvTotal: number;
  }>;
};

export type StandsExtra = {
  groupes: StandsGroupResult[];
  totalAchatGroupes: number;
  totalPvGroupesHorsFrais: number;
  totalFraisFixesGroupes: number;
  totalPvGroupes: number;
};

export function calculerStands(input: StandsInput): CalcOutput & { extra: StandsExtra } {
  const { sections, params } = input;
  const quantites = normalizeQuantites(input.quantites);

  // Per-group results (independent of quantity — stands are typically 1 unit)
  const baseGroupes = sections.map((sec, index) => {
    const achatTotal = sec.lignes.reduce((a, l) => a + (Number(l.prixUnitaire) || 0), 0);
    const margePct = resolveMargePct(sec.margePct, null, params.coef_marge_pct);
    // creation extra applies globally
    const facteur = (1 + margePct / 100) * (1 + params.marge_crea_pct / 100);
    const pvTotalHorsFrais = achatTotal * facteur;
    const lignes = sec.lignes.map((l) => {
      const achat = Number(l.prixUnitaire) || 0;
      return {
        achat,
        pvTotalHorsFrais: achat * facteur,
      };
    });
    return {
      libelle: resolveStandsSectionLabel(sec, index),
      achatTotal,
      margePct,
      pvTotalHorsFrais,
      lignes,
    };
  });

  const totalAchatGroupes = baseGroupes.reduce((s, g) => s + g.achatTotal, 0);
  const totalPvGroupesHorsFrais = baseGroupes.reduce((s, g) => s + g.pvTotalHorsFrais, 0);
  const totalFraisFixesGroupes = totalAchatGroupes * (params.frais_fixes_pct / 100);
  const groupes: StandsGroupResult[] = baseGroupes.map((group) => {
    const groupFraisFixes =
      totalAchatGroupes > 0 ? totalFraisFixesGroupes * (group.achatTotal / totalAchatGroupes) : 0;
    const lignes = group.lignes.map((line) => {
      const lineFraisFixes =
        group.achatTotal > 0 ? groupFraisFixes * (line.achat / group.achatTotal) : 0;
      return {
        ...line,
        fraisFixes: lineFraisFixes,
        pvTotal: line.pvTotalHorsFrais + lineFraisFixes,
      };
    });
    return {
      ...group,
      fraisFixes: groupFraisFixes,
      pvTotal: group.pvTotalHorsFrais + groupFraisFixes,
      lignes,
    };
  });
  const totalPvGroupes = groupes.reduce((s, g) => s + g.pvTotal, 0);

  const scenarios: QuantityResult[] = (
    quantites.length ? quantites : [{ qty: 1, margePct: null }]
  ).map((quant) => {
    const Q = Number(quant.qty) || 0;
    const prixUnitaireAchat = totalAchatGroupes;
    const prixVenteNetUnit = totalPvGroupesHorsFrais;
    const achatsTotal = prixUnitaireAchat * Q;
    const fraisFixes = achatsTotal * (params.frais_fixes_pct / 100);
    const budgetNet = prixVenteNetUnit * Q;
    const commRapUnit = prixVenteNetUnit * (params.commission_rapporteur_pct / 100);
    const commRapTotal = commRapUnit * Q;
    const totalPrixUnitaire = totalPvGroupes + commRapUnit;
    const totalCA = totalPrixUnitaire * Q;
    // Les frais fixes sont un bonus ajouté au prix final : ils ne dégradent pas la marge affichée.
    const totalDepenses = achatsTotal + commRapTotal;
    const margeNet = budgetNet - achatsTotal;
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
    extra: {
      groupes,
      totalAchatGroupes,
      totalPvGroupesHorsFrais,
      totalFraisFixesGroupes,
      totalPvGroupes,
    },
  };
}
