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
  /** Marge propre à la ligne (%). Vide : hérite de la marge du groupe, puis du dossier. */
  margePct?: number | null;
  /** Quantity scenarios proposed for this article. Missing means all (legacy dossiers). */
  quantitesActives?: boolean[];
};

export type StandsSection = {
  libelle: string;
  lignes: StandsSectionLine[];
  /** Displays this section separately in the Options section of client and Sage offers. */
  isOption?: boolean;
  /** Combines every transport cost in this section into one client-facing "Transport" row. */
  transportGlobal?: boolean;
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

export function isStandsOptionSection(
  section: Pick<StandsSection, "isOption" | "libelle"> | null | undefined,
  resolvedLabel?: unknown,
) {
  if (typeof section?.isOption === "boolean") return section.isOption;
  const label = String(resolvedLabel ?? section?.libelle ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\boptions?\b/.test(label);
}

export function isStandsTransportSection(
  section: Pick<StandsSection, "libelle"> | null | undefined,
  resolvedLabel?: unknown,
) {
  const label = String(resolvedLabel ?? section?.libelle ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return /\btransport\b/.test(label);
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
    active: boolean;
    achat: number;
    margePct: number;
    pvTotalHorsFrais: number;
    fraisFixes: number;
    pvTotal: number;
  }>;
};

export type StandsExtra = {
  groupes: StandsGroupResult[];
  /** Scenario-specific groups after applying each article's selected quantities. */
  groupesParQuantite: StandsGroupResult[][];
  totalAchatGroupes: number;
  totalPvGroupesHorsFrais: number;
  totalFraisFixesGroupes: number;
  totalPvGroupes: number;
};

export function calculerStands(input: StandsInput): CalcOutput & { extra: StandsExtra } {
  const { sections, params } = input;
  const quantites = normalizeQuantites(input.quantites);

  function buildGroupsForQuantity(quantityIndex: number) {
    const baseGroupes = sections.map((sec, index) => {
      const margePct = resolveMargePct(sec.margePct, null, params.coef_marge_pct);
      const lignes = sec.lignes.map((line) => {
        const active =
          !Array.isArray(line.quantitesActives) || line.quantitesActives[quantityIndex] === true;
        const achat = active ? Number(line.prixUnitaire) || 0 : 0;
        const lineMargePct = resolveMargePct(line.margePct, null, margePct);
        const facteur = (1 + lineMargePct / 100) * (1 + params.marge_crea_pct / 100);
        return { active, achat, margePct: lineMargePct, pvTotalHorsFrais: achat * facteur };
      });
      return {
        libelle: resolveStandsSectionLabel(sec, index),
        achatTotal: lignes.reduce((sum, line) => sum + line.achat, 0),
        margePct,
        pvTotalHorsFrais: lignes.reduce((sum, line) => sum + line.pvTotalHorsFrais, 0),
        lignes,
      };
    });
    const totalAchatGroupes = baseGroupes.reduce((sum, group) => sum + group.achatTotal, 0);
    const totalPvGroupesHorsFrais = baseGroupes.reduce(
      (sum, group) => sum + group.pvTotalHorsFrais,
      0,
    );
    const totalFraisFixesGroupes = totalAchatGroupes * (params.frais_fixes_pct / 100);
    const groupes: StandsGroupResult[] = baseGroupes.map((group) => {
      const fraisFixes =
        totalAchatGroupes > 0 ? totalFraisFixesGroupes * (group.achatTotal / totalAchatGroupes) : 0;
      const lignes = group.lignes.map((line) => {
        const lineFraisFixes =
          group.achatTotal > 0 ? fraisFixes * (line.achat / group.achatTotal) : 0;
        return {
          ...line,
          fraisFixes: lineFraisFixes,
          pvTotal: line.pvTotalHorsFrais + lineFraisFixes,
        };
      });
      return { ...group, fraisFixes, pvTotal: group.pvTotalHorsFrais + fraisFixes, lignes };
    });
    return {
      groupes,
      totalAchatGroupes,
      totalPvGroupesHorsFrais,
      totalFraisFixesGroupes,
      totalPvGroupes: groupes.reduce((sum, group) => sum + group.pvTotal, 0),
    };
  }

  const scenarioQuantities = quantites.length ? quantites : [{ qty: 1, margePct: null }];
  const groupsByQuantity = scenarioQuantities.map((_, index) => buildGroupsForQuantity(index));
  const scenarios: QuantityResult[] = scenarioQuantities.map((quant, quantityIndex) => {
    const groupData = groupsByQuantity[quantityIndex];
    const Q = Number(quant.qty) || 0;
    const prixUnitaireAchat = groupData.totalAchatGroupes;
    const prixVenteNetUnit = groupData.totalPvGroupesHorsFrais;
    const achatsTotal = prixUnitaireAchat * Q;
    const fraisFixes = achatsTotal * (params.frais_fixes_pct / 100);
    const budgetNet = prixVenteNetUnit * Q;
    const commRapUnit = prixVenteNetUnit * (params.commission_rapporteur_pct / 100);
    const commRapTotal = commRapUnit * Q;
    const totalPrixUnitaire = groupData.totalPvGroupes + commRapUnit;
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
      ...groupsByQuantity[0],
      groupesParQuantite: groupsByQuantity.map((groupData) => groupData.groupes),
    },
  };
}
