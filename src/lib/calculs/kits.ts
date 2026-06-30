export type KitsParams = {
  marge_residuelle_cible_pct: number;
};

export type KitElement = {
  libelle: string;
  prixAchatUnit: number;
  qtyParVariante: number[]; // qty par kit pour chaque variante
};

export type KitVariante = {
  libelle: string;
  nbKits: number;
};

export type KitsInput = {
  variantes: KitVariante[];
  elements: KitElement[];
  params: KitsParams;
};

export const KITS_DEFAULTS: KitsParams = { marge_residuelle_cible_pct: 35 };

export type KitsElementResult = {
  libelle: string;
  prixAchatUnit: number;
  pvUnit: number;
  qtyTotale: number;
  totalAchat: number;
  totalPV: number;
};

export type KitsVarianteResult = {
  libelle: string;
  nbKits: number;
  totalAchat: number;
  totalPV: number;
  marge: number;
};

export type KitsOutput = {
  elementResults: KitsElementResult[];
  varianteResults: KitsVarianteResult[];
  totalAchat: number;
  totalPV: number;
  margeGlobale: number;
  margePct: number;
};

export function calculerKits(input: KitsInput): KitsOutput {
  const { variantes, elements, params } = input;
  const m = params.marge_residuelle_cible_pct / 100;
  const facteur = m < 1 ? 1 / (1 - m) : 1;

  const elementResults: KitsElementResult[] = elements.map((el) => {
    const pvUnit = (Number(el.prixAchatUnit) || 0) * facteur;
    const qtyTotale = variantes.reduce(
      (s, v, i) => s + (Number(el.qtyParVariante[i]) || 0) * (Number(v.nbKits) || 0),
      0,
    );
    return {
      libelle: el.libelle,
      prixAchatUnit: Number(el.prixAchatUnit) || 0,
      pvUnit,
      qtyTotale,
      totalAchat: (Number(el.prixAchatUnit) || 0) * qtyTotale,
      totalPV: pvUnit * qtyTotale,
    };
  });

  const varianteResults: KitsVarianteResult[] = variantes.map((v, i) => {
    const nb = Number(v.nbKits) || 0;
    let achatKit = 0;
    let pvKit = 0;
    elements.forEach((el) => {
      const q = Number(el.qtyParVariante[i]) || 0;
      achatKit += q * (Number(el.prixAchatUnit) || 0);
      pvKit += q * (Number(el.prixAchatUnit) || 0) * facteur;
    });
    return {
      libelle: v.libelle,
      nbKits: nb,
      totalAchat: achatKit * nb,
      totalPV: pvKit * nb,
      marge: (pvKit - achatKit) * nb,
    };
  });

  const totalAchat = elementResults.reduce((s, r) => s + r.totalAchat, 0);
  const totalPV = elementResults.reduce((s, r) => s + r.totalPV, 0);
  const margeGlobale = totalPV - totalAchat;
  return {
    elementResults,
    varianteResults,
    totalAchat,
    totalPV,
    margeGlobale,
    margePct: totalPV > 0 ? margeGlobale / totalPV : 0,
  };
}
