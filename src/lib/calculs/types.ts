// Shared calculation types

export type LineItem = {
  libelle: string;
  prixUnitaire: number;
};

export type LineForfait = {
  libelle: string;
  montantGlobal: number; // divided by quantité
};

export type QuantityResult = {
  quantite: number;
  prixUnitaireAchat: number;
  prixVenteNetUnit: number;
  achatsTotal: number;
  fraisFixes: number;
  commissionSourcingUnit: number;
  commissionRapporteurUnit: number;
  commissionRapporteurTotal: number;
  totalPrixUnitaire: number;
  totalCA: number;
  totalDepenses: number;
  margeNet: number;
  margePct: number;
  alerteMarge: boolean;
  // optional Contra-specific
  margeContra?: number;
  margeContraPct?: number;
  margeAutres?: number;
  margeAutresPct?: number;
};

export type CalcOutput = {
  scenarios: QuantityResult[];
  totalMargeNet: number;
  totalCA: number;
};
