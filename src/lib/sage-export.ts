import {
  pvFromContraSharedRaw,
  resolveContraMargePct,
  sanitizeContraInput,
} from "@/lib/calculs/contra";
import { getPrixAchat, resolveMargePct } from "@/lib/calculs/types";

export type SageExportRow = {
  reference: string;
  dateDevis: string;
  codeClientSage: string;
  client: string;
  contact: string;
  email: string;
  objet: string;
  typeDossier: string;
  numeroLigne: number;
  codeArticle: string;
  designation: string;
  description: string;
  quantite: number;
  prixUnitaireHT: number;
  tauxTVA: number;
  montantHT: number;
  option: string;
};

export type SageExportOptions = {
  sageClientCode?: string;
  defaultArticleCode?: string;
  depotCode?: string;
  pieceType?: string;
  includeHeader?: boolean;
  repeatHeaderOnDetailLines?: boolean;
  decimalSeparator?: "comma" | "dot";
  columnSeparator?: "semicolon" | "tab";
  includeDepotColumn?: boolean;
  includeSageOptions?: boolean;
};

type SageSaveResult = "saved" | "downloaded" | "cancelled";

type FileSystemFileHandleLike = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type SavePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

const SAGE_PIECE_HEADERS = [
  "Type de Ligne",
  "Type pièce",
  "Numero",
  "Date",
  "Code_cli",
  "Nom_Cli",
  "Code article",
  "Désignation",
  "Quantite",
  "PU HT",
  "Taux TVA",
] as const;

const SAGE_PIECE_HEADERS_WITH_DEPOT = [
  "Type de Ligne",
  "Type pièce",
  "Numero",
  "Date",
  "Code_cli",
  "Nom_Cli",
  "Code article",
  "Depot",
  "Désignation",
  "Quantite",
  "PU HT",
  "Taux TVA",
] as const;

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\r?\n+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFilenamePart(value: unknown, fallback: string) {
  const cleaned = cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

function csvText(value: unknown, delimiter = ";") {
  const text = cleanText(value);
  if (text.includes(delimiter) || /["\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvNumber(value: unknown, decimals = 2, decimalSeparator: "comma" | "dot" = "comma") {
  const n = Number(value) || 0;
  const formatted = n.toLocaleString("fr-FR", {
    useGrouping: false,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return decimalSeparator === "dot" ? formatted.replace(",", ".") : formatted;
}

function isOptionLabel(value: unknown) {
  return cleanText(value).toLowerCase().includes("option");
}

function selectedScenario(output: any, scenarioIndex: number) {
  const scenarios = Array.isArray(output?.scenarios) ? output.scenarios : [];
  return (
    scenarios[scenarioIndex] ?? scenarios.find((scenario: any) => Number(scenario?.quantite) > 0)
  );
}

function lineDetails(lines: any[]) {
  return lines
    .map((line) => {
      const label = cleanText(line?.libelle);
      const description = cleanText(line?.descriptif);
      return [label, description].filter(Boolean).join(" : ");
    })
    .filter(Boolean)
    .join(" | ");
}

function scenarioQuantity(scenario: any) {
  return Number(scenario?.quantite) || 0;
}

function rowUnitFromTotal(total: number, quantity: number) {
  return quantity > 0 ? total / quantity : total;
}

function hasTransport(payload: any, scenario: any) {
  return (
    payload?.transportPackaging?.transportInclus === true ||
    Math.abs(Number(scenario?.transportPackagingGlobal) || 0) > 0.005 ||
    Math.abs(Number(scenario?.transportPackagingUnit) || 0) > 0.005
  );
}

function hasOutillage(payload: any, scenario: any) {
  return (
    Math.abs(Number(payload?.outillage?.montantGlobal) || 0) > 0.005 ||
    Math.abs(Number(scenario?.outillageGlobal) || 0) > 0.005 ||
    Math.abs(Number(scenario?.outillageUnit) || 0) > 0.005
  );
}

function commercialConditions(payload: any, scenario: any) {
  return [
    hasTransport(payload, scenario) ? "Transport inclus" : "EXW depart nos ateliers",
    hasOutillage(payload, scenario) ? "Outillage inclus" : "",
  ].filter(Boolean);
}

function sageLineDesignation(row: SageExportRow) {
  return [row.designation, row.description].map(cleanText).filter(Boolean).join(" - ");
}

function commonRowBase(params: {
  dossier: any;
  meta: { reference: string; objet: string };
  lineNumber: number;
  codeArticle: string;
  designation: string;
  description: string;
  quantity: number;
  unitPrice: number;
  option?: boolean;
}): SageExportRow {
  const { dossier, meta, lineNumber, codeArticle, designation, description, quantity, unitPrice } =
    params;
  const client = dossier?.clients ?? {};
  const reference = cleanText(meta.reference || dossier?.reference);
  return {
    reference,
    dateDevis: new Date().toLocaleDateString("fr-FR"),
    codeClientSage: cleanText(client.code_sage ?? client.codeSage ?? ""),
    client: cleanText(client.entreprise),
    contact: cleanText(dossier?.contact || client.contact),
    email: cleanText(dossier?.email || client.email),
    objet: cleanText(meta.objet || dossier?.objet),
    typeDossier: cleanText(dossier?.type),
    numeroLigne: lineNumber,
    codeArticle,
    designation: cleanText(designation),
    description: cleanText(description),
    quantite: Number(quantity) || 0,
    prixUnitaireHT: Number(unitPrice) || 0,
    tauxTVA: 20,
    montantHT: (Number(quantity) || 0) * (Number(unitPrice) || 0),
    option: params.option ? "Oui" : "Non",
  };
}

export function getSageClientCode(dossier: any) {
  const client = dossier?.clients ?? {};
  return cleanText(client.code_sage ?? client.codeSage ?? client.code_client_sage ?? "");
}

export function getDefaultSageArticleCode(dossier: any) {
  void dossier;
  return "ART0016";
}

export function getDefaultSageDepotCode(dossier: any) {
  const client = dossier?.clients ?? {};
  return cleanText(client.code_depot_sage ?? client.codeDepotSage ?? "");
}

export function getDefaultSagePieceType() {
  return "Devis";
}

function buildStandardRows(params: {
  dossier: any;
  meta: { reference: string; objet: string };
  payload: any;
  output: any;
  scenarioIndex: number;
}) {
  const { dossier, meta, payload, output, scenarioIndex } = params;
  const scenario = selectedScenario(output, scenarioIndex);
  if (!scenario) return [];

  const quantity = scenarioQuantity(scenario);
  const quantiteMarge = payload?.quantites?.[scenarioIndex]?.margePct ?? null;
  const defaultMarge = Number(payload?.params?.coef_marge_pct) || 0;
  const mainLines: any[] = [];
  const optionLines: any[] = [];
  let optionsTotal = 0;

  for (const line of payload?.achatsPrincipaux ?? []) {
    const achat = getPrixAchat(line, scenarioIndex);
    const marge = resolveMargePct(line?.margePct, quantiteMarge, defaultMarge);
    const unit = achat * (1 + marge / 100);
    if (isOptionLabel(line?.libelle)) {
      optionLines.push(line);
      optionsTotal += unit * quantity;
    } else {
      mainLines.push(line);
    }
  }

  const totalHT = Number(scenario.totalCA) || 0;
  const mainTotal = totalHT - optionsTotal;
  const rows = [
    commonRowBase({
      dossier,
      meta,
      lineNumber: 1,
      codeArticle: "YQ-PRESTATION",
      designation: cleanText(meta.objet || dossier?.objet || "Prestation"),
      description: [
        ...(lineDetails(mainLines) ? [lineDetails(mainLines)] : []),
        ...commercialConditions(payload, scenario),
      ].join(" | "),
      quantity,
      unitPrice: rowUnitFromTotal(mainTotal, quantity),
    }),
  ];

  if (Math.abs(optionsTotal) > 0.005) {
    rows.push(
      commonRowBase({
        dossier,
        meta,
        lineNumber: rows.length + 1,
        codeArticle: "YQ-OPTION",
        designation: "Options",
        description: lineDetails(optionLines),
        quantity,
        unitPrice: rowUnitFromTotal(optionsTotal, quantity),
        option: true,
      }),
    );
  }

  return rows;
}

function buildContraRows(params: {
  dossier: any;
  meta: { reference: string; objet: string };
  payload: any;
  output: any;
  scenarioIndex: number;
}) {
  const { dossier, meta, output, scenarioIndex } = params;
  const payload = sanitizeContraInput(params.payload);
  const scenario = selectedScenario(output, scenarioIndex);
  if (!scenario) return [];

  const quantity = scenarioQuantity(scenario);
  const quantiteRow = payload?.quantites?.[scenarioIndex];
  const quantiteMarge = quantiteRow?.margePct ?? null;
  const quantiteConfirmed = quantiteRow?.margeConfirmed;
  const coefContra = Number(payload?.params?.coef_contra_pct) || 0;
  const margeFor = (m: number | null | undefined, c: boolean | undefined) =>
    resolveContraMargePct(m, c, quantiteMarge, quantiteConfirmed);
  const mainLines: any[] = [];
  const optionLines: any[] = [];
  let optionsTotal = 0;

  for (const line of payload?.achatsContra ?? []) {
    const raw = getPrixAchat(line, scenarioIndex);
    const unit = pvFromContraSharedRaw(
      raw,
      coefContra,
      margeFor(line?.margePct, line?.margeConfirmed),
    );
    if (isOptionLabel(line?.libelle)) {
      optionLines.push(line);
      optionsTotal += unit * quantity;
    } else {
      mainLines.push(line);
    }
  }

  for (const line of payload?.forfaitsContra ?? []) {
    const share = quantity > 0 ? (Number(line?.montantGlobal) || 0) / quantity : 0;
    const unit = pvFromContraSharedRaw(
      share,
      coefContra,
      margeFor(line?.margePct, line?.margeConfirmed),
    );
    if (isOptionLabel(line?.libelle)) {
      optionLines.push(line);
      optionsTotal += unit * quantity;
    } else {
      mainLines.push(line);
    }
  }

  const totalHT = Number(scenario.totalCA) || 0;
  const mainTotal = totalHT - optionsTotal;
  const rows = [
    commonRowBase({
      dossier,
      meta,
      lineNumber: 1,
      codeArticle: "YQ-PRESTATION",
      designation: cleanText(meta.objet || dossier?.objet || "Prestation"),
      description: [
        ...(lineDetails(mainLines) ? [lineDetails(mainLines)] : []),
        ...commercialConditions(payload, scenario),
      ].join(" | "),
      quantity,
      unitPrice: rowUnitFromTotal(mainTotal, quantity),
    }),
  ];

  if (Math.abs(optionsTotal) > 0.005) {
    rows.push(
      commonRowBase({
        dossier,
        meta,
        lineNumber: rows.length + 1,
        codeArticle: "YQ-OPTION",
        designation: "Options",
        description: lineDetails(optionLines),
        quantity,
        unitPrice: rowUnitFromTotal(optionsTotal, quantity),
        option: true,
      }),
    );
  }

  return rows;
}

function buildStandRows(params: {
  dossier: any;
  meta: { reference: string; objet: string };
  payload: any;
  output: any;
  scenarioIndex: number;
}) {
  const { dossier, meta, payload, output, scenarioIndex } = params;
  const scenario = selectedScenario(output, scenarioIndex);
  if (!scenario) return [];
  const quantity = Number(scenario.quantite) || 1;
  const groups = Array.isArray(output?.extra?.groupes) ? output.extra.groupes : [];
  const rows: SageExportRow[] = [];

  groups.forEach((group: any, index: number) => {
    const unitPrice = Number(group?.pvTotal) || 0;
    const section = payload?.sections?.[index];
    const hasLines = Array.isArray(section?.lignes) && section.lignes.length > 0;
    if (!hasLines && Math.abs(unitPrice) < 0.005) return;

    rows.push(
      commonRowBase({
        dossier,
        meta,
        lineNumber: rows.length + 1,
        codeArticle: isOptionLabel(group?.libelle) ? "YQ-OPTION" : "YQ-STAND",
        designation: cleanText(group?.libelle || section?.libelle || `Section ${index + 1}`),
        description: lineDetails(section?.lignes ?? []),
        quantity,
        unitPrice,
        option: isOptionLabel(group?.libelle || section?.libelle),
      }),
    );
  });

  const coordination = Number(scenario.commissionRapporteurUnit) || 0;
  if (Math.abs(coordination) > 0.005) {
    rows.push(
      commonRowBase({
        dossier,
        meta,
        lineNumber: rows.length + 1,
        codeArticle: "YQ-SUIVI",
        designation: "Coordination / suivi projet",
        description: "",
        quantity,
        unitPrice: coordination,
      }),
    );
  }

  const currentTotal = rows.reduce((sum, row) => sum + row.montantHT, 0);
  const expectedTotal = Number(scenario.totalCA) || 0;
  const delta = expectedTotal - currentTotal;
  if (Math.abs(delta) > 0.01) {
    rows.push(
      commonRowBase({
        dossier,
        meta,
        lineNumber: rows.length + 1,
        codeArticle: "YQ-AJUST",
        designation: "Ajustement calcul",
        description: "",
        quantity,
        unitPrice: quantity > 0 ? delta / quantity : delta,
      }),
    );
  }

  return rows;
}

export function buildSageQuoteRows(params: {
  dossier: any;
  meta: { reference: string; objet: string };
  payload: any;
  output: any;
  scenarioIndex: number;
}) {
  if (params.dossier?.type === "stands") return buildStandRows(params);
  if (params.dossier?.type === "standard") return buildStandardRows(params);
  if (params.dossier?.type === "contra") return buildContraRows(params);
  return [];
}

export function makeSageQuoteCsv(params: {
  dossier: any;
  meta: { reference: string; objet: string };
  payload: any;
  output: any;
  scenarioIndex: number;
  options?: SageExportOptions;
}) {
  const rows = buildSageQuoteRows(params);
  const client = params.dossier?.clients ?? {};
  const datePiece = new Date().toLocaleDateString("fr-FR");
  const sageClientCode = cleanText(
    params.options?.sageClientCode || getSageClientCode(params.dossier),
  );
  const defaultArticleCode = cleanText(
    params.options?.defaultArticleCode || getDefaultSageArticleCode(params.dossier),
  );
  const depotCode = cleanText(params.options?.depotCode || getDefaultSageDepotCode(params.dossier));
  const pieceType = cleanText(params.options?.pieceType || getDefaultSagePieceType());
  const includeHeader = params.options?.includeHeader === true;
  const repeatHeaderOnDetailLines = params.options?.repeatHeaderOnDetailLines === true;
  const decimalSeparator = params.options?.decimalSeparator ?? "dot";
  const includeDepotColumn = params.options?.includeDepotColumn === true && Boolean(depotCode);
  const includeSageOptions = params.options?.includeSageOptions === true;
  const delimiter = params.options?.columnSeparator === "semicolon" ? ";" : "\t";
  const headers = [
    ...(includeDepotColumn ? SAGE_PIECE_HEADERS_WITH_DEPOT : SAGE_PIECE_HEADERS),
    ...(includeSageOptions ? ["Option"] : []),
  ];
  const numericStartIndex = includeDepotColumn ? 9 : 8;
  const header = headers.map((label) => csvText(label, delimiter)).join(delimiter);
  const pieceHeader = [
    "E",
    pieceType,
    "",
    datePiece,
    sageClientCode,
    cleanText(client.entreprise),
    ...(includeDepotColumn ? [""] : []),
    "",
    "",
    "",
    "",
    "",
    ...(includeSageOptions ? ["-NoStock"] : []),
  ]
    .map((value) => csvText(value, delimiter))
    .join(delimiter);
  const detailRows = rows.map((row) =>
    (repeatHeaderOnDetailLines
      ? [
          "L",
          pieceType,
          "",
          datePiece,
          sageClientCode,
          cleanText(client.entreprise),
          defaultArticleCode,
          ...(includeDepotColumn ? [depotCode] : []),
          sageLineDesignation(row),
          csvNumber(row.quantite, 3, decimalSeparator),
          csvNumber(row.prixUnitaireHT, 2, decimalSeparator),
          csvNumber(row.tauxTVA, 2, decimalSeparator),
          ...(includeSageOptions ? [""] : []),
        ]
      : [
          "L",
          "",
          "",
          "",
          "",
          "",
          defaultArticleCode,
          ...(includeDepotColumn ? [depotCode] : []),
          sageLineDesignation(row),
          csvNumber(row.quantite, 3, decimalSeparator),
          csvNumber(row.prixUnitaireHT, 2, decimalSeparator),
          csvNumber(row.tauxTVA, 2, decimalSeparator),
          ...(includeSageOptions ? [""] : []),
        ]
    )
      .map((value, index) =>
        index >= numericStartIndex ? String(value) : csvText(value, delimiter),
      )
      .join(delimiter),
  );
  const lines = includeHeader ? [header, pieceHeader, ...detailRows] : [pieceHeader, ...detailRows];
  return lines.join("\r\n") + "\r\n";
}

export function makeSageQuoteFilename(params: {
  dossier: any;
  meta: { reference: string; objet: string };
}) {
  const reference = safeFilenamePart(
    params.meta.reference || params.dossier?.reference,
    "sans-reference",
  );
  const client = safeFilenamePart(params.dossier?.clients?.entreprise, "client");
  const objet = safeFilenamePart(params.meta.objet || params.dossier?.objet, "devis");
  return `sage-devis-${reference}-${client}-${objet}.txt`;
}

function createCsvBlob(csv: string) {
  return new Blob([csv], { type: "text/plain;charset=utf-8" });
}

function downloadCsv(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function saveSageQuoteCsv(params: {
  dossier: any;
  meta: { reference: string; objet: string };
  payload: any;
  output: any;
  scenarioIndex: number;
  options?: SageExportOptions;
}): Promise<SageSaveResult> {
  const csv = makeSageQuoteCsv(params);
  const filename = makeSageQuoteFilename(params);
  const blob = createCsvBlob(csv);
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (options?: SavePickerOptions) => Promise<FileSystemFileHandleLike>;
    }
  ).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: "Fichier texte Sage",
            accept: { "text/plain": [".txt"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error: any) {
      if (error?.name === "AbortError") return "cancelled";
      throw error;
    }
  }

  downloadCsv(filename, blob);
  return "downloaded";
}

export function downloadSageQuoteDiagnosticCsvs(params: {
  dossier: any;
  meta: { reference: string; objet: string };
  payload: any;
  output: any;
  scenarioIndex: number;
  options?: SageExportOptions;
}) {
  const baseFilename = makeSageQuoteFilename(params).replace(/\.(csv|txt)$/i, "");
  const baseOptions = params.options ?? {};
  const variants: Array<{ suffix: string; extension: "csv" | "txt"; options: SageExportOptions }> =
    [
      {
        suffix: "01-officiel-titre-virgule",
        extension: "csv",
        options: { ...baseOptions, includeHeader: true, repeatHeaderOnDetailLines: false },
      },
      {
        suffix: "02-officiel-sans-titre-virgule",
        extension: "csv",
        options: { ...baseOptions, includeHeader: false, repeatHeaderOnDetailLines: false },
      },
      {
        suffix: "03-complet-titre-virgule",
        extension: "csv",
        options: { ...baseOptions, includeHeader: true, repeatHeaderOnDetailLines: true },
      },
      {
        suffix: "04-complet-sans-titre-virgule",
        extension: "csv",
        options: { ...baseOptions, includeHeader: false, repeatHeaderOnDetailLines: true },
      },
      {
        suffix: "05-officiel-titre-point",
        extension: "csv",
        options: {
          ...baseOptions,
          includeHeader: true,
          repeatHeaderOnDetailLines: false,
          decimalSeparator: "dot",
        },
      },
      {
        suffix: "06-devis-proforma-titre-virgule",
        extension: "csv",
        options: {
          ...baseOptions,
          pieceType: "Devis/Proforma",
          includeHeader: true,
          repeatHeaderOnDetailLines: false,
        },
      },
      {
        suffix: "07-officiel-titre-tabulation",
        extension: "txt",
        options: {
          ...baseOptions,
          includeHeader: true,
          repeatHeaderOnDetailLines: false,
          columnSeparator: "tab",
          decimalSeparator: "dot",
        },
      },
      {
        suffix: "08-officiel-sans-titre-tabulation",
        extension: "txt",
        options: {
          ...baseOptions,
          includeHeader: false,
          repeatHeaderOnDetailLines: false,
          columnSeparator: "tab",
          decimalSeparator: "dot",
        },
      },
      {
        suffix: "09-complet-titre-tabulation",
        extension: "txt",
        options: {
          ...baseOptions,
          includeHeader: true,
          repeatHeaderOnDetailLines: true,
          columnSeparator: "tab",
          decimalSeparator: "dot",
        },
      },
      {
        suffix: "10-devis-majuscule-titre-tabulation",
        extension: "txt",
        options: {
          ...baseOptions,
          pieceType: "DEVIS",
          includeHeader: true,
          repeatHeaderOnDetailLines: false,
          columnSeparator: "tab",
          decimalSeparator: "dot",
        },
      },
      {
        suffix: "11-officiel-titre-depot-virgule",
        extension: "csv",
        options: {
          ...baseOptions,
          includeHeader: true,
          repeatHeaderOnDetailLines: false,
          includeDepotColumn: true,
        },
      },
      {
        suffix: "12-officiel-titre-depot-point",
        extension: "csv",
        options: {
          ...baseOptions,
          includeHeader: true,
          repeatHeaderOnDetailLines: false,
          includeDepotColumn: true,
          decimalSeparator: "dot",
        },
      },
      {
        suffix: "13-complet-titre-depot-virgule",
        extension: "csv",
        options: {
          ...baseOptions,
          includeHeader: true,
          repeatHeaderOnDetailLines: true,
          includeDepotColumn: true,
        },
      },
      {
        suffix: "14-officiel-titre-depot-tabulation",
        extension: "txt",
        options: {
          ...baseOptions,
          includeHeader: true,
          repeatHeaderOnDetailLines: false,
          includeDepotColumn: true,
          columnSeparator: "tab",
          decimalSeparator: "dot",
        },
      },
    ];

  for (const variant of variants) {
    const csv = makeSageQuoteCsv({ ...params, options: variant.options });
    downloadCsv(`${baseFilename}-${variant.suffix}.${variant.extension}`, createCsvBlob(csv));
  }
}
