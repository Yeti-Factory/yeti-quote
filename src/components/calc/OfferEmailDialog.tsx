import { useEffect, useMemo, useState } from "react";
import { Clipboard, FileDown, ImagePlus, Mail, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  pvFromContraSharedRaw,
  resolveContraLineMargePct,
  resolveContraMargePct,
  sanitizeContraInput,
} from "@/lib/calculs/contra";
import {
  getPrixAchat,
  getTransportLigneGlobal,
  getTransportLigneUnit,
  isOptionLine,
  normalizeTransportPackaging,
  resolveMargePct,
  resolveLineMargePct,
} from "@/lib/calculs/types";
import { formatClientGreetingName } from "@/lib/client-contact";
import { calculateCarbonEstimate, type CarbonEstimateResult } from "@/lib/carbon";
import { fmtEUR } from "@/lib/format";
import { isStandsOptionSection } from "@/lib/calculs/stands";

type OfferRow = {
  rowKey?: string;
  designation: string;
  quantity: number;
  unitPrice: number;
  details?: string[];
  isOption?: boolean;
  fixedFeesBasisUnit?: number;
};

type ScenarioItem = {
  scenario: any;
  index: number;
};

type OfferScenarioSummary = {
  quantity: number;
  label: string;
  mainRows: OfferRow[];
  optionRows: OfferRow[];
  mainTotalHT: number;
  optionsTotalHT: number;
  totalHT: number;
  vat: number;
  totalTTC: number;
};

type OfferEmailDialogProps = {
  dossier: any;
  meta: {
    reference: string;
    objet: string;
  };
  payload: any;
  output: any;
  onImageChange?: (image: MailImage | null) => void;
};

type MailImage = {
  name: string;
  src: string;
  enabled?: boolean;
};

type OfferPrototype = {
  priceHT: number;
  description: string;
  comment: string;
};

type OfferCommonInfo = {
  title: string;
  text: string;
};

type ToolingPresentation = "distributed" | "global";

const FONT = '"Avenir LT Pro Book 45", "Avenir LT Pro", Avenir, Arial, Helvetica, sans-serif';
const YETI_ORANGE = "#ff7900";
const MAIL_TEXT = "#222222";
const MAIL_MUTED = "#666666";
const MAIL_BORDER = "#eadfd7";
const MAIL_SOFT = "#fff7f0";
const MAX_MAIL_IMAGE_SIZE = 900;
const MAX_MAIL_IMAGE_BYTES = 8 * 1024 * 1024;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function cleanLabel(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function normalizeMailImage(value: unknown): MailImage | null {
  if (!value || typeof value !== "object") return null;
  const image = value as Partial<MailImage>;
  if (!image.src || typeof image.src !== "string") return null;
  return {
    name: typeof image.name === "string" && image.name.trim() ? image.name : "image-offre.jpg",
    src: image.src,
    enabled: image.enabled !== false,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture de l'image impossible"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image illisible"));
    image.src = src;
  });
}

async function prepareMailImage(file: File): Promise<MailImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choisissez un fichier image.");
  }
  if (file.size > MAX_MAIL_IMAGE_BYTES) {
    throw new Error("Image trop lourde : utilisez une image de moins de 8 Mo.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, MAX_MAIL_IMAGE_SIZE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Redimensionnement de l'image impossible");
  context.drawImage(image, 0, 0, width, height);

  return {
    name: file.name,
    src: canvas.toDataURL("image/jpeg", 0.86),
  };
}

function buildMailImageRow(image: MailImage | null) {
  if (!image) return "";
  return `<tr>
      <td style="padding:0 0 14px 0;">
        <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.name)}" style="display:block;width:100%;max-width:620px;height:auto;border:1px solid ${MAIL_BORDER};" />
      </td>
    </tr>`;
}

function formatCarbon(value: number) {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function buildCarbonPlainText(
  carbon: CarbonEstimateResult | null,
  quantities: Array<{ label: string; quantity: number }>,
) {
  if (!carbon) return [];
  return [
    `Estimation prévisionnelle de l’empreinte carbone : ${formatCarbon(carbon.kgCo2ePerSet)} kg CO₂e par ensemble livré.`,
    ...quantities.map(
      ({ label, quantity }) =>
        `${label} : ${formatCarbon(carbon.kgCo2ePerSet * quantity)} kg CO₂e pour la commande.`,
    ),
    "Estimation indicative réalisée à partir du poids, des matières et des quantités renseignés.",
  ];
}

function buildCarbonHtmlRow(
  carbon: CarbonEstimateResult | null,
  quantities: Array<{ label: string; quantity: number }>,
) {
  if (!carbon) return "";
  const totals = quantities
    .map(
      ({ label, quantity }) =>
        `<span style="display:inline-block;margin:4px 8px 0 0;padding:3px 7px;border-radius:999px;background:#ffffff;color:#166534;font-size:10.5px;">${escapeHtml(label)} : ${escapeHtml(formatCarbon(carbon.kgCo2ePerSet * quantity))} kg CO₂e</span>`,
    )
    .join("");
  return `<tr>
    <td style="padding:0 0 14px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #a7d7b5;border-left:4px solid #16803c;background:#effaf2;font-family:${FONT};">
        <tr><td style="padding:10px 12px;color:#14532d;">
          <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;">Estimation prévisionnelle de l’empreinte carbone</div>
          <div style="margin-top:3px;font-size:15px;font-weight:800;">${escapeHtml(formatCarbon(carbon.kgCo2ePerSet))} kg CO₂e par ensemble livré</div>
          <div>${totals}</div>
          <div style="margin-top:6px;color:#3f684b;font-size:10.5px;">Estimation indicative réalisée à partir du poids, des matières et des quantités renseignés.</div>
        </td></tr>
      </table>
    </td>
  </tr>`;
}

function normalizeOfferPrototype(value: unknown): OfferPrototype | null {
  if (!value || typeof value !== "object") return null;
  const prototype = value as {
    enabled?: unknown;
    priceHT?: unknown;
    description?: unknown;
    comment?: unknown;
  };
  if (prototype.enabled !== true) return null;
  return {
    priceHT: Math.max(0, Number(prototype.priceHT) || 0),
    description: String(prototype.description ?? "").trim(),
    comment: String(prototype.comment ?? "").trim(),
  };
}

function multilineHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function normalizeOfferCommonInfo(value: unknown): OfferCommonInfo | null {
  if (!value || typeof value !== "object") return null;
  const info = value as { title?: unknown; text?: unknown };
  const title = String(info.title ?? "").trim();
  const text = String(info.text ?? "").trim();
  if (!title && !text) return null;
  return { title, text };
}

function buildCommonOfferInfoPlainText(info: OfferCommonInfo | null) {
  if (!info) return [];
  return [(info.title || "Informations communes").toUpperCase(), ...(info.text ? [info.text] : [])];
}

function buildCommonOfferInfoHtmlRow(info: OfferCommonInfo | null) {
  if (!info) return "";
  return `<tr>
    <td style="padding:0 0 14px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid ${MAIL_BORDER};border-left:4px solid ${YETI_ORANGE};background:#fffaf6;font-family:${FONT};">
        <tr><td style="padding:11px 12px;color:${MAIL_TEXT};">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:${YETI_ORANGE};">${escapeHtml(info.title || "Informations communes")}</div>
          ${info.text ? `<div style="margin-top:7px;font-size:12px;line-height:1.45;">${multilineHtml(info.text)}</div>` : ""}
        </td></tr>
      </table>
    </td>
  </tr>`;
}

function buildPrototypePlainText(prototype: OfferPrototype | null) {
  if (!prototype) return "";
  const lines = [
    "PROTOTYPE",
    `Prix du prototype : ${fmtEUR(prototype.priceHT)} HT (${fmtEUR(prototype.priceHT * 1.2)} TTC)`,
  ];
  if (prototype.description) lines.push(`Descriptif : ${prototype.description}`);
  if (prototype.comment) lines.push(`Commentaire : ${prototype.comment}`);
  return lines.join("\n");
}

function buildPrototypeHtmlRow(prototype: OfferPrototype | null) {
  if (!prototype) return "";
  return `<tr>
    <td style="padding:16px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid ${MAIL_BORDER};border-left:4px solid ${YETI_ORANGE};background:#fffaf6;font-family:${FONT};">
        <tr><td style="padding:11px 12px;color:${MAIL_TEXT};">
          <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:${YETI_ORANGE};">Prototype</div>
          <div style="margin-top:3px;font-size:15px;font-weight:800;">${escapeHtml(fmtEUR(prototype.priceHT))} HT <span style="font-size:11px;font-weight:500;color:${MAIL_MUTED};">(${escapeHtml(fmtEUR(prototype.priceHT * 1.2))} TTC)</span></div>
          ${prototype.description ? `<div style="margin-top:8px;font-size:12px;"><strong>Descriptif :</strong><br />${multilineHtml(prototype.description)}</div>` : ""}
          ${prototype.comment ? `<div style="margin-top:7px;font-size:11px;color:${MAIL_MUTED};"><strong>Commentaire :</strong><br />${multilineHtml(prototype.comment)}</div>` : ""}
        </td></tr>
      </table>
    </td>
  </tr>`;
}

function appendPrototypePlainText(plainText: string, prototype: OfferPrototype | null) {
  const block = buildPrototypePlainText(prototype);
  if (!block) return plainText;

  const markers = ["\nConditions :\n", "\nCette offre est indicative et valable 8 jours,"];
  const insertionIndex = markers
    .map((marker) => plainText.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  if (insertionIndex === undefined) return `${plainText.trimEnd()}\n\n${block}`;
  return `${plainText.slice(0, insertionIndex).trimEnd()}\n\n${block}\n${plainText.slice(insertionIndex).trimStart()}`;
}

function appendPrototypeHtml(html: string, prototype: OfferPrototype | null) {
  const block = buildPrototypeHtmlRow(prototype);
  if (!block) return html;

  const conditionsLabel = ">Conditions</p>";
  const conditionsIndex = html.indexOf(conditionsLabel);
  const conditionsRowIndex = conditionsIndex >= 0 ? html.lastIndexOf("<tr>", conditionsIndex) : -1;
  if (conditionsRowIndex >= 0) {
    return `${html.slice(0, conditionsRowIndex)}${block}\n    ${html.slice(conditionsRowIndex)}`;
  }

  const closing = /<\/table>\s*<\/div>\s*$/;
  return closing.test(html)
    ? html.replace(closing, `${block}\n  </table>\n</div>`)
    : `${html}${block}`;
}

function buildOfferContactName(dossier: any) {
  return formatClientGreetingName(dossier?.clients ?? {}, dossier?.contact);
}

function buildLineDetail(line: any, fallback: string) {
  const label = cleanLabel(line?.libelle, fallback)
    .replace(/\s+composants?$/i, "")
    .trim();
  const description = cleanLabel(line?.descriptif, "");
  return description ? `${label}\n${description}` : label;
}

function buildOptionRowDetails(line: any) {
  const description = cleanLabel(line?.descriptif, "");
  return description ? [description] : [];
}

// Keep each option as its own priced row in Standard and Contra offers.

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanDetails(details: string[] = []) {
  const seen = new Set<string>();
  return details
    .map((detail) => detail.trim())
    .filter((detail) => {
      if (!detail || seen.has(detail)) return false;
      seen.add(detail);
      return true;
    });
}

function addRow(
  rows: OfferRow[],
  designation: string,
  quantity: number,
  unitPrice: number,
  details: string[] = [],
  isOption = false,
  fixedFeesBasisUnit = 0,
  rowKey?: string,
) {
  if (!Number.isFinite(unitPrice) || Math.abs(unitPrice) < 0.005) return;
  rows.push({
    rowKey,
    designation: cleanLabel(designation, "Prestation"),
    quantity,
    unitPrice,
    details: cleanDetails(details),
    isOption,
    fixedFeesBasisUnit,
  });
}

function buildStandardRows(
  payload: any,
  scenario: any,
  scenarioIndex: number,
  primaryDesignation = "Achats principaux",
  detailedMainRows = false,
): OfferRow[] {
  const rows: OfferRow[] = [];
  const quantite = Number(scenario.quantite) || 0;
  const quantiteMarge = payload?.quantites?.[scenarioIndex]?.margePct ?? null;
  const defaultMarge = Number(payload?.params?.coef_marge_pct) || 0;

  let achatsPrincipauxUnit = 0;
  let achatsPrincipauxBasisUnit = 0;
  const achatsPrincipauxDetails: string[] = [];
  const optionRows: OfferRow[] = [];
  for (const [index, line] of (payload?.achatsPrincipaux ?? []).entries()) {
    const achat = getPrixAchat(line, scenarioIndex);
    const transportLigneUnit = getTransportLigneUnit(line, scenarioIndex, quantite);
    const lineBase = achat + transportLigneUnit;
    const marge = resolveLineMargePct(line, scenarioIndex, quantiteMarge, defaultMarge);
    const lineUnit = lineBase * (1 + marge / 100);
    const lineDetail = buildLineDetail(line, `Prestation ${index + 1}`);
    if (isOptionLine(line)) {
      addRow(
        optionRows,
        cleanLabel(line?.libelle, `Option ${optionRows.length + 1}`),
        quantite,
        lineUnit,
        buildOptionRowDetails(line),
        true,
        lineBase,
        `standard-option-${index}`,
      );
    } else if (detailedMainRows) {
      addRow(
        rows,
        cleanLabel(line?.libelle, `Prestation ${index + 1}`),
        quantite,
        lineUnit,
        buildOptionRowDetails(line),
        false,
        lineBase,
        `standard-main-${index}`,
      );
    } else {
      achatsPrincipauxUnit += lineUnit;
      achatsPrincipauxBasisUnit += lineBase;
      achatsPrincipauxDetails.push(lineDetail);
    }
  }
  if (!detailedMainRows) {
    addRow(
      rows,
      primaryDesignation,
      quantite,
      achatsPrincipauxUnit,
      achatsPrincipauxDetails,
      false,
      achatsPrincipauxBasisUnit,
      "standard-main-total",
    );
  }
  rows.push(...optionRows);

  const tpUnit = Number(scenario.transportPackagingUnit) || 0;
  const tpMarge = Number(scenario.transportPackagingMargePct) || 0;
  addRow(
    rows,
    "Transport / Packaging",
    quantite,
    tpUnit * (1 + tpMarge / 100),
    [],
    false,
    tpUnit,
    "standard-transport-packaging",
  );

  const outillageUnit = Number(scenario.outillageUnit) || 0;
  const outillageMarge = Number(scenario.outillageMargePct) || 0;
  addRow(
    rows,
    "Outillage",
    quantite,
    outillageUnit * (1 + outillageMarge / 100),
    [],
    false,
    outillageUnit,
    "standard-tooling",
  );

  const sourcingUnit = Number(scenario.commissionSourcingUnit) || 0;
  const sourcingMarge = resolveMargePct(null, quantiteMarge, defaultMarge);
  addRow(
    rows,
    "Commission sourcing",
    quantite,
    sourcingUnit * (1 + sourcingMarge / 100),
    [],
    false,
    sourcingUnit,
    "standard-sourcing-commission",
  );

  addRow(
    rows,
    "Commission rapporteur",
    quantite,
    Number(scenario.commissionRapporteurUnit) || 0,
    [],
    false,
    0,
    "standard-referrer-commission",
  );

  return rows;
}

function buildContraRows(
  rawPayload: any,
  scenario: any,
  scenarioIndex: number,
  primaryDesignation = "Achats chez Contra",
  detailedMainRows = false,
): OfferRow[] {
  // Mêmes règles que le calcul : ligne confirmée > quantité confirmée > 25 %.
  const payload = sanitizeContraInput(rawPayload);
  const rows: OfferRow[] = [];
  const quantite = Number(scenario.quantite) || 0;
  const quantiteRow = payload?.quantites?.[scenarioIndex];
  const quantiteMarge = quantiteRow?.margePct ?? null;
  const quantiteConfirmed = quantiteRow?.margeConfirmed;
  const coefContra = Number(payload?.params?.coef_contra_pct) || 0;
  const contraFactor = 1 + coefContra / 100;
  const margeFor = (m: number | null | undefined, c: boolean | undefined) =>
    resolveContraMargePct(m, c, quantiteMarge, quantiteConfirmed);

  let achatsContraUnit = 0;
  let achatsContraBasisUnit = 0;
  const achatsContraDetails: string[] = [];
  const optionsContraRows: OfferRow[] = [];
  for (const [index, line] of (payload?.achatsContra ?? []).entries()) {
    const raw = getPrixAchat(line, scenarioIndex);
    const transportLigneUnit = getTransportLigneUnit(line, scenarioIndex, quantite);
    const lineBase = raw + transportLigneUnit;
    const margeYeti = resolveContraLineMargePct(
      line,
      scenarioIndex,
      quantiteMarge,
      quantiteConfirmed,
    );
    const lineUnit = pvFromContraSharedRaw(lineBase, coefContra, margeYeti);
    const lineDetail = buildLineDetail(line, `Prestation Contra ${index + 1}`);
    if (isOptionLine(line)) {
      addRow(
        optionsContraRows,
        cleanLabel(line?.libelle, `Option Contra ${optionsContraRows.length + 1}`),
        quantite,
        lineUnit,
        buildOptionRowDetails(line),
        true,
        lineBase * contraFactor,
        `contra-option-${index}`,
      );
    } else if (detailedMainRows) {
      addRow(
        rows,
        cleanLabel(line?.libelle, `Prestation Contra ${index + 1}`),
        quantite,
        lineUnit,
        buildOptionRowDetails(line),
        false,
        lineBase * contraFactor,
        `contra-main-${index}`,
      );
    } else {
      achatsContraUnit += lineUnit;
      achatsContraBasisUnit += lineBase * contraFactor;
      achatsContraDetails.push(lineDetail);
    }
  }
  if (!detailedMainRows) {
    addRow(
      rows,
      primaryDesignation,
      quantite,
      achatsContraUnit,
      achatsContraDetails,
      false,
      achatsContraBasisUnit,
      "contra-main-total",
    );
  }
  rows.push(...optionsContraRows);

  let forfaitsContraUnit = 0;
  let forfaitsContraBasisUnit = 0;
  const forfaitsContraDetails: string[] = [];
  const optionsForfaitsRows: OfferRow[] = [];
  for (const [index, line] of (payload?.forfaitsContra ?? []).entries()) {
    const share = quantite > 0 ? (Number(line?.montantGlobal) || 0) / quantite : 0;
    const margeYeti = margeFor(line?.margePct, line?.margeConfirmed);
    const lineUnit = pvFromContraSharedRaw(share, coefContra, margeYeti);
    const lineDetail = buildLineDetail(line, `Forfait Contra ${index + 1}`);
    if (isOptionLine(line)) {
      addRow(
        optionsForfaitsRows,
        cleanLabel(line?.libelle, `Option forfaitaire ${optionsForfaitsRows.length + 1}`),
        quantite,
        lineUnit,
        buildOptionRowDetails(line),
        true,
        share * contraFactor,
        `forfait-option-${index}`,
      );
    } else if (detailedMainRows) {
      addRow(
        rows,
        cleanLabel(line?.libelle, `Forfait Contra ${index + 1}`),
        quantite,
        lineUnit,
        buildOptionRowDetails(line),
        false,
        share * contraFactor,
        `contra-forfait-${index}`,
      );
    } else {
      forfaitsContraUnit += lineUnit;
      forfaitsContraBasisUnit += share * contraFactor;
      forfaitsContraDetails.push(lineDetail);
    }
  }
  if (!detailedMainRows) {
    addRow(
      rows,
      "Forfaits Contra",
      quantite,
      forfaitsContraUnit,
      forfaitsContraDetails,
      false,
      forfaitsContraBasisUnit,
      "contra-forfaits-total",
    );
  }
  rows.push(...optionsForfaitsRows);

  const tpUnit = Number(scenario.transportPackagingUnit) || 0;
  const tpMarge = margeFor(
    payload?.transportPackaging?.margePct,
    payload?.transportPackaging?.margeConfirmed,
  );
  addRow(
    rows,
    "Transport / Packaging",
    quantite,
    pvFromContraSharedRaw(tpUnit, coefContra, tpMarge),
    [],
    false,
    tpUnit * contraFactor,
    "contra-transport-packaging",
  );

  const outillageUnit = Number(scenario.outillageUnit) || 0;
  const outillageMarge = margeFor(payload?.outillage?.margePct, payload?.outillage?.margeConfirmed);
  addRow(
    rows,
    "Outillage",
    quantite,
    pvFromContraSharedRaw(outillageUnit, coefContra, outillageMarge),
    [],
    false,
    outillageUnit * contraFactor,
    "contra-tooling",
  );

  addRow(
    rows,
    "Commission sourcing",
    quantite,
    Number(scenario.commissionSourcingUnit) || 0,
    [],
    false,
    Number(scenario.commissionSourcingUnit) || 0,
    "contra-sourcing-commission",
  );
  addRow(
    rows,
    "Commission rapporteur",
    quantite,
    Number(scenario.commissionRapporteurUnit) || 0,
    [],
    false,
    0,
    "contra-referrer-commission",
  );

  return rows;
}

function buildStandRows(
  payload: any,
  output: any,
  scenario: any,
  detailedMainRows = false,
): OfferRow[] {
  const rows: OfferRow[] = [];
  const quantite = Number(scenario.quantite) || 0;
  const groups = output?.extra?.groupes ?? [];

  for (const [index, group] of groups.entries()) {
    const sectionLines = payload?.sections?.[index]?.lignes ?? [];
    const hasInputLines = sectionLines.length > 0;
    if (!hasInputLines && !(Number(group?.pvTotal) > 0)) continue;
    const groupLabel = cleanLabel(
      group?.libelle || payload?.sections?.[index]?.libelle,
      `Groupe ${index + 1}`,
    );
    const groupIsOption = isStandsOptionSection(payload?.sections?.[index], groupLabel);

    if (detailedMainRows && hasInputLines) {
      for (const [lineIndex, line] of sectionLines.entries()) {
        const result = group?.lignes?.[lineIndex];
        const lineLabel = cleanLabel(line?.libelle, `Ligne ${lineIndex + 1}`);
        const designation =
          normalizeSearch(lineLabel) === normalizeSearch(groupLabel)
            ? groupLabel
            : `${groupLabel} — ${lineLabel}`;
        addRow(
          rows,
          designation,
          quantite,
          Number(result?.pvTotalHorsFrais ?? result?.pvTotal) || 0,
          buildOptionRowDetails(line),
          groupIsOption,
          Number(result?.achat) || 0,
          `stands-${index}-${lineIndex}`,
        );
      }
      continue;
    }

    const details = hasInputLines
      ? sectionLines.map((line: any, lineIndex: number) =>
          buildLineDetail(line, `${groupLabel} - ligne ${lineIndex + 1}`),
        )
      : [];

    addRow(
      rows,
      groupLabel,
      quantite,
      Number(group?.pvTotalHorsFrais ?? group?.pvTotal) || 0,
      details,
      groupIsOption,
      Number(group?.achatTotal) || 0,
      `stands-group-${index}`,
    );
  }

  addRow(
    rows,
    "Coordination / suivi projet",
    quantite,
    Number(scenario.commissionRapporteurUnit) || 0,
  );

  return rows;
}

function buildOfferRows(
  type: string,
  payload: any,
  output: any,
  scenario: any,
  scenarioIndex: number,
  primaryDesignation?: string,
  detailedMainRows = false,
) {
  if (type === "standard")
    return buildStandardRows(
      payload,
      scenario,
      scenarioIndex,
      primaryDesignation,
      detailedMainRows,
    );
  if (type === "contra")
    return buildContraRows(payload, scenario, scenarioIndex, primaryDesignation, detailedMainRows);
  if (type === "stands") return buildStandRows(payload, output, scenario, detailedMainRows);
  return [];
}

function distributeFixedFees(rows: OfferRow[], scenario: any) {
  const fixedFees = Number(scenario.fraisFixes) || 0;
  if (Math.abs(fixedFees) < 0.005) return rows;

  const bases = rows.map((row) => {
    const quantity = Number(row.quantity) || 0;
    const basisUnit = Number(row.fixedFeesBasisUnit) || 0;
    return quantity > 0 && basisUnit > 0 ? basisUnit * quantity : 0;
  });
  const totalBasis = bases.reduce((sum, value) => sum + value, 0);
  if (totalBasis <= 0) return rows;

  return rows.map((row, index) => {
    const quantity = Number(row.quantity) || 0;
    if (quantity <= 0 || bases[index] <= 0) return row;
    const fixedFeesShare = fixedFees * (bases[index] / totalBasis);
    return {
      ...row,
      unitPrice: row.unitPrice + fixedFeesShare / quantity,
    };
  });
}

function reconcileRows(rows: OfferRow[], scenario: any) {
  const expectedTotal = Number(scenario.totalCA) || 0;
  const currentTotal = rows.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0);
  const delta = expectedTotal - currentTotal;

  if (Math.abs(delta) <= 0.01) return rows;

  const bases = rows.map((row) => {
    const total = Math.abs(row.unitPrice * row.quantity);
    return Number.isFinite(total) ? total : 0;
  });
  const totalBasis = bases.reduce((sum, value) => sum + value, 0);
  if (totalBasis <= 0) return rows;

  return rows.map((row, index) => {
    const quantity = Number(row.quantity) || 0;
    if (quantity <= 0 || bases[index] <= 0) return row;
    const deltaShare = delta * (bases[index] / totalBasis);
    return {
      ...row,
      unitPrice: row.unitPrice + deltaShare / quantity,
    };
  });
}

function rowTotal(row: OfferRow) {
  return row.unitPrice * row.quantity;
}

function rowsTotal(rows: OfferRow[]) {
  return rows.reduce((sum, row) => sum + rowTotal(row), 0);
}

function isToolingRow(row: OfferRow) {
  return normalizeSearch(row.designation) === "outillage";
}

function prepareToolingSummaries(
  summaries: OfferScenarioSummary[],
  presentation: ToolingPresentation,
) {
  if (presentation !== "global") {
    return { summaries, globalToolingHT: 0 };
  }

  const toolingTotals = summaries.map((summary) =>
    rowsTotal(summary.mainRows.filter(isToolingRow)),
  );
  const globalToolingHT = toolingTotals.find((value) => Math.abs(value) > 0.005) ?? 0;
  const adjusted = summaries.map((summary, index) => {
    const toolingHT = toolingTotals[index] || 0;
    const totalHT = summary.totalHT - toolingHT;
    return {
      ...summary,
      mainRows: summary.mainRows.filter((row) => !isToolingRow(row)),
      mainTotalHT: summary.mainTotalHT - toolingHT,
      totalHT,
      vat: totalHT * 0.2,
      totalTTC: totalHT * 1.2,
    };
  });

  return { summaries: adjusted, globalToolingHT };
}

function buildGlobalToolingPlainText(amount: number) {
  return Math.abs(amount) > 0.005 ? `Outillage : montant global HT ${fmtEUR(amount)}` : "";
}

function buildGlobalToolingHtmlRow(amount: number) {
  if (Math.abs(amount) <= 0.005) return "";
  return `<tr>
    <td style="padding:0 0 14px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid ${MAIL_BORDER};border-left:4px solid ${YETI_ORANGE};background:#fffaf6;font-family:${FONT};">
        <tr>
          <td style="padding:10px 12px;color:${MAIL_TEXT};font-size:12px;font-weight:700;">Outillage — montant global HT</td>
          <td style="padding:10px 12px;text-align:right;color:${YETI_ORANGE};font-size:15px;font-weight:800;white-space:nowrap;">${escapeHtml(fmtEUR(amount))}</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function summarizeRows(rows: OfferRow[], scenario: any): OfferScenarioSummary {
  const quantity = Number(scenario.quantite) || 0;
  const mainRows = rows.filter((row) => !row.isOption);
  const optionRows = rows.filter((row) => row.isOption);
  const mainTotalHT = rowsTotal(mainRows);
  const optionsTotalHT = rowsTotal(optionRows);
  const totalHT = mainTotalHT + optionsTotalHT;
  const vat = totalHT * 0.2;
  const totalTTC = totalHT + vat;

  return {
    quantity,
    label: `Qté ${quantity.toLocaleString("fr-FR")}`,
    mainRows,
    optionRows,
    mainTotalHT,
    optionsTotalHT,
    totalHT,
    vat,
    totalTTC,
  };
}

function buildScenarioSummary(
  type: string,
  payload: any,
  output: any,
  item: ScenarioItem,
  primaryDesignation?: string,
  detailedMainRows = false,
) {
  const rawRows = buildOfferRows(
    type,
    payload,
    output,
    item.scenario,
    item.index,
    primaryDesignation,
    detailedMainRows,
  );
  return summarizeRows(
    reconcileRows(distributeFixedFees(rawRows, item.scenario), item.scenario),
    item.scenario,
  );
}

function buildPlainRows(rows: OfferRow[], showLineSubtotals: boolean) {
  return rows.flatMap((row) => [
    `- ${row.designation} - qté ${row.quantity.toLocaleString("fr-FR")} - PU HT ${fmtEUR(row.unitPrice)}${showLineSubtotals ? ` - Sous-total HT ${fmtEUR(rowTotal(row))}` : ""}`,
    ...buildPlainDetailLines(row.details ?? [], "  "),
  ]);
}

function unitPriceFromTotal(summary: OfferScenarioSummary, total: number) {
  return summary.quantity > 0 ? total / summary.quantity : total;
}

function splitDetail(detail: string) {
  const [label = "", ...descriptionLines] = String(detail).split(/\r?\n/);
  return {
    label: label.trim(),
    description: descriptionLines.join("\n").trim(),
  };
}

function buildPlainDetailLines(details: string[], indent = "") {
  return details.flatMap((detail) => {
    const { label, description } = splitDetail(detail);
    if (!label) return [];
    return [
      `${indent}- ${label}`,
      ...description
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `${indent}  ${line}`),
    ];
  });
}

function buildDetailHtml(detail: string) {
  const { label, description } = splitDetail(detail);
  if (!label) return "";
  const descriptionHtml = escapeHtml(description).replace(/\r?\n/g, "<br />");
  return `<div style="margin:2px 0;">
    <div>&bull;&nbsp;${escapeHtml(label)}</div>
    ${
      description
        ? `<div style="margin:2px 0 0 12px;color:${MAIL_MUTED};line-height:1.35;">${descriptionHtml}</div>`
        : ""
    }
  </div>`;
}

function collectDetails(rowsByScenario: OfferRow[][]) {
  const seen = new Set<string>();
  const details: string[] = [];

  for (const rows of rowsByScenario) {
    for (const row of rows) {
      for (const detail of row.details ?? []) {
        const cleaned = detail.trim();
        if (!cleaned || seen.has(cleaned)) continue;
        seen.add(cleaned);
        details.push(cleaned);
      }
    }
  }

  return details;
}

function collectOptionRows(summaries: OfferScenarioSummary[]) {
  const rowsByKey = new Map<string, OfferRow>();
  for (const summary of summaries) {
    summary.optionRows.forEach((row, index) => {
      const key = row.rowKey ?? `option-${normalizeSearch(row.designation)}-${index}`;
      if (!rowsByKey.has(key)) rowsByKey.set(key, { ...row, rowKey: key });
    });
  }
  return [...rowsByKey.values()];
}

function findOptionForScenario(summary: OfferScenarioSummary, option: OfferRow) {
  return summary.optionRows.find((row, index) => {
    const key = row.rowKey ?? `option-${normalizeSearch(row.designation)}-${index}`;
    return key === option.rowKey;
  });
}

function collectMainRows(summaries: OfferScenarioSummary[]) {
  const rowsByKey = new Map<string, OfferRow>();
  for (const summary of summaries) {
    summary.mainRows.forEach((row, index) => {
      const key = row.rowKey ?? `main-${normalizeSearch(row.designation)}-${index}`;
      if (!rowsByKey.has(key)) rowsByKey.set(key, { ...row, rowKey: key });
    });
  }
  return [...rowsByKey.values()];
}

function findMainForScenario(summary: OfferScenarioSummary, mainRow: OfferRow) {
  return summary.mainRows.find((row, index) => {
    const key = row.rowKey ?? `main-${normalizeSearch(row.designation)}-${index}`;
    return key === mainRow.rowKey;
  });
}

function buildPlainTextEmail(params: {
  subject: string;
  clientName: string;
  contactName: string;
  reference: string;
  objet: string;
  mainRows: OfferRow[];
  optionRows: OfferRow[];
  mainTotalHT: number;
  optionsTotalHT: number;
  totalHT: number;
  vat: number;
  totalTTC: number;
  carbon: CarbonEstimateResult | null;
  commonInfo: OfferCommonInfo | null;
  quantity: number;
  showGlobalTotals: boolean;
  showLineSubtotals: boolean;
}) {
  const {
    clientName,
    contactName,
    reference,
    objet,
    mainRows,
    optionRows,
    mainTotalHT,
    optionsTotalHT,
    totalHT,
    vat,
    totalTTC,
    carbon,
    commonInfo,
    quantity,
    showGlobalTotals,
    showLineSubtotals,
  } = params;
  const greeting = contactName ? `Bonjour ${contactName},` : "Bonjour,";
  const hasOptions = optionRows.length > 0;

  return [
    greeting,
    "",
    `Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée pour : ${objet}.`,
    clientName ? `Client : ${clientName}` : "",
    reference ? `Dossier : ${reference}` : "",
    "",
    ...buildCommonOfferInfoPlainText(commonInfo),
    commonInfo ? "" : "",
    hasOptions ? "Offre principale :" : "Détail de l'offre :",
    ...buildPlainRows(mainRows, showLineSubtotals),
    hasOptions && showLineSubtotals
      ? `Sous-total offre principale HT : ${fmtEUR(mainTotalHT)}`
      : "",
    hasOptions ? "Options :" : "",
    ...buildPlainRows(optionRows, showLineSubtotals),
    hasOptions && showLineSubtotals ? `Sous-total options HT : ${fmtEUR(optionsTotalHT)}` : "",
    "",
    showGlobalTotals
      ? hasOptions
        ? `Total général HT : ${fmtEUR(totalHT)}`
        : `Total HT : ${fmtEUR(totalHT)}`
      : "",
    showGlobalTotals ? `TVA 20 % : ${fmtEUR(vat)}` : "",
    showGlobalTotals ? `Total TTC : ${fmtEUR(totalTTC)}` : "",
    "",
    ...buildCarbonPlainText(carbon, [{ label: `Qté ${quantity}`, quantity }]),
    "Cette offre est indicative et valable 8 jours, sous réserve de validation technique et de disponibilité.",
    "Si cette proposition vous convient, nous vous transmettrons ensuite le devis officiel.",
    "",
    "Le Yeti vous remercie pour votre confiance.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHtmlEmail(params: {
  clientName: string;
  contactName: string;
  clientEmail: string;
  reference: string;
  objet: string;
  image: MailImage | null;
  mainRows: OfferRow[];
  optionRows: OfferRow[];
  mainTotalHT: number;
  optionsTotalHT: number;
  totalHT: number;
  vat: number;
  totalTTC: number;
  carbon: CarbonEstimateResult | null;
  commonInfo: OfferCommonInfo | null;
  quantity: number;
  showGlobalTotals: boolean;
  showLineSubtotals: boolean;
}) {
  const {
    clientName,
    contactName,
    clientEmail,
    reference,
    objet,
    image,
    mainRows,
    optionRows,
    mainTotalHT,
    optionsTotalHT,
    totalHT,
    vat,
    totalTTC,
    carbon,
    commonInfo,
    quantity,
    showGlobalTotals,
    showLineSubtotals,
  } = params;
  const greeting = contactName ? `Bonjour ${escapeHtml(contactName)},` : "Bonjour,";
  const hasOptions = optionRows.length > 0;
  const detailHtml = (details: string[] | undefined) =>
    details?.length
      ? `<div style="margin-top:6px;padding-top:5px;border-top:1px solid ${MAIL_BORDER};color:${MAIL_MUTED};font-size:11px;line-height:1.35;">
          ${details.map(buildDetailHtml).join("")}
        </div>`
      : "";
  const rowHtml = (rows: OfferRow[]) =>
    rows
      .map(
        (row) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};color:${MAIL_TEXT};font-size:12px;">
            <div style="font-weight:700;">${escapeHtml(row.designation)}</div>
            ${detailHtml(row.details)}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(row.quantity.toLocaleString("fr-FR"))}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;white-space:nowrap;">${escapeHtml(fmtEUR(row.unitPrice))}</td>
          ${showLineSubtotals ? `<td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;white-space:nowrap;font-weight:700;">${escapeHtml(fmtEUR(rowTotal(row)))}</td>` : ""}
        </tr>`,
      )
      .join("");
  const offerTable = (title: string, rows: OfferRow[], totalLabel: string, total: number) =>
    rows.length
      ? `<tr>
      <td style="padding:0 0 14px 0;">
        <div style="padding:0 0 6px 0;color:${YETI_ORANGE};font-weight:700;text-transform:uppercase;font-size:11px;">${escapeHtml(title)}</div>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid ${MAIL_BORDER};font-family:${FONT};">
          <thead>
            <tr>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:left;font-size:11px;text-transform:uppercase;">Désignation</th>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:62px;">Qté</th>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:105px;">PU HT</th>
              ${showLineSubtotals ? `<th style="padding:7px 10px;background:${MAIL_SOFT};color:${YETI_ORANGE};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:120px;">Sous-total HT</th>` : ""}
            </tr>
          </thead>
          <tbody>
            ${rowHtml(rows)}
${
  showLineSubtotals
    ? `<tr>
              <td colspan="3" style="padding:8px 10px;text-align:right;background:#fffaf6;color:${MAIL_TEXT};font-size:12px;font-weight:700;">${escapeHtml(totalLabel.replace(/^Total/, "Sous-total"))}</td>
              <td style="padding:8px 10px;text-align:right;background:#fffaf6;color:${MAIL_TEXT};font-size:12px;font-weight:800;white-space:nowrap;">${escapeHtml(fmtEUR(total))}</td>
            </tr>`
    : ""
}
          </tbody>
        </table>
      </td>
    </tr>`
      : "";

  const globalTotalsTable = `
    <tr>
      <td style="padding:0 0 16px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:${FONT};">
          ${
            hasOptions
              ? `<tr>
            <td style="padding:5px 10px;text-align:right;color:${MAIL_MUTED};font-size:12px;">Total offre principale HT</td>
            <td style="padding:5px 10px;text-align:right;color:${MAIL_TEXT};font-size:12px;width:145px;font-weight:700;">${escapeHtml(fmtEUR(mainTotalHT))}</td>
          </tr>
          <tr>
            <td style="padding:5px 10px;text-align:right;color:${MAIL_MUTED};font-size:12px;">Total options HT</td>
            <td style="padding:5px 10px;text-align:right;color:${MAIL_TEXT};font-size:12px;font-weight:700;">${escapeHtml(fmtEUR(optionsTotalHT))}</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:5px 10px;text-align:right;color:${MAIL_MUTED};font-size:12px;">${hasOptions ? "Total général HT" : "Total HT"}</td>
            <td style="padding:5px 10px;text-align:right;color:${MAIL_TEXT};font-size:12px;width:145px;font-weight:700;">${escapeHtml(fmtEUR(totalHT))}</td>
          </tr>
          <tr>
            <td style="padding:5px 10px;text-align:right;color:${MAIL_MUTED};font-size:12px;">TVA 20 %</td>
            <td style="padding:5px 10px;text-align:right;color:${MAIL_TEXT};font-size:12px;font-weight:700;">${escapeHtml(fmtEUR(vat))}</td>
          </tr>
          <tr>
            <td style="padding:9px 10px;text-align:right;border-top:2px solid ${YETI_ORANGE};color:${MAIL_TEXT};font-size:12px;font-weight:700;">Total TTC</td>
            <td style="padding:9px 10px;text-align:right;border-top:2px solid ${YETI_ORANGE};color:${YETI_ORANGE};font-size:15px;font-weight:800;">${escapeHtml(fmtEUR(totalTTC))}</td>
          </tr>
        </table>
      </td>
    </tr>
`;

  return `
<div style="margin:0;padding:0;background:#ffffff;color:${MAIL_TEXT};font-family:${FONT};font-size:12.5px;line-height:1.4;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:760px;border-collapse:collapse;font-family:${FONT};">
    <tr>
      <td style="padding:0 0 12px 0;color:${MAIL_TEXT};">
        <p style="margin:0 0 8px 0;">${greeting}</p>
        <p style="margin:0;">Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée.</p>
      </td>
    </tr>
    ${buildCarbonHtmlRow(carbon, [{ label: `Qté ${quantity}`, quantity }])}
    <tr>
      <td style="padding:0 0 14px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid ${MAIL_BORDER};border-left:3px solid ${YETI_ORANGE};">
          <tr>
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;width:130px;">Client</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(clientName || "-")}</td>
          </tr>
          ${
            clientEmail
              ? `<tr><td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Email</td><td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(clientEmail)}</td></tr>`
              : ""
          }
          <tr>
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Référence</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(objet || "-")}</td>
          </tr>
          <tr>
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Date</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(formatDate())}</td>
          </tr>
          ${
            reference
              ? `<tr><td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Dossier</td><td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(reference)}</td></tr>`
              : ""
          }
        </table>
      </td>
    </tr>
    ${buildMailImageRow(image)}
    ${buildCommonOfferInfoHtmlRow(commonInfo)}
    ${offerTable(
      hasOptions ? "Offre principale" : "Détail de l'offre",
      mainRows,
      hasOptions ? "Total offre principale HT" : "Total HT",
      mainTotalHT,
    )}
    ${offerTable("Options", optionRows, "Total options HT", optionsTotalHT)}
    ${showGlobalTotals ? globalTotalsTable : ""}
    <tr>
      <td style="padding:10px 12px;border:1px solid ${MAIL_BORDER};border-left:3px solid ${YETI_ORANGE};background:#fffaf6;color:${MAIL_TEXT};font-size:12px;">
        <p style="margin:0 0 6px 0;color:${YETI_ORANGE};font-weight:700;">Conditions</p>
        <p style="margin:0 0 5px 0;">Offre indicative valable 8 jours, sous réserve de validation technique et de disponibilité.</p>
        <p style="margin:0 0 5px 0;">Si cette proposition vous convient, nous vous transmettrons ensuite le devis officiel.</p>
        <p style="margin:0;">Le Yeti vous remercie pour votre confiance.</p>
      </td>
    </tr>
  </table>
</div>`;
}

function hasLineTransport(payload: any, scenarioItems: ScenarioItem[]) {
  const lines = payload?.achatsPrincipaux ?? payload?.achatsContra ?? [];
  return lines.some((line: any) =>
    scenarioItems.some((item) => Math.abs(getTransportLigneGlobal(line, item.index)) > 0.005),
  );
}

function buildTransportCondition(payload: any, scenarioItems: ScenarioItem[]) {
  const tp = normalizeTransportPackaging(payload?.transportPackaging, scenarioItems.length);
  if (tp.mode === "depart_ateliers") {
    const dept = String(tp.departementDepart ?? "").trim();
    return dept ? `Prix départ nos ateliers (${dept}).` : "Prix départ nos ateliers.";
  }
  if (
    tp.transportInclus === true ||
    scenarioItems.some((item) => {
      const transportGlobal = Number(item.scenario.transportPackagingGlobal) || 0;
      const transportUnit = Number(item.scenario.transportPackagingUnit) || 0;
      return Math.abs(transportGlobal) > 0.005 || Math.abs(transportUnit) > 0.005;
    }) ||
    hasLineTransport(payload, scenarioItems)
  ) {
    return "Transport inclus.";
  }
  return "EXW (départ) nos ateliers.";
}

function buildPlainQuantityPrice(
  summary: OfferScenarioSummary,
  total: number,
  showLineSubtotals: boolean,
) {
  return `${summary.label} : PU HT ${fmtEUR(unitPriceFromTotal(summary, total))} / u${showLineSubtotals ? ` - Sous-total HT ${fmtEUR(total)}` : ""}`;
}

function buildPlainTotalsRows(summaries: OfferScenarioSummary[], hasOptions: boolean) {
  const rows = [];
  rows.push(
    "Prix unitaire (offre et options incluses) : " +
      summaries
        .map(
          (summary) =>
            `${summary.label} HT ${fmtEUR(unitPriceFromTotal(summary, summary.totalHT))} / u - TTC ${fmtEUR(unitPriceFromTotal(summary, summary.totalTTC))} / u`,
        )
        .join(" | "),
  );
  if (hasOptions) {
    rows.push(
      "Total général HT : " +
        summaries.map((summary) => `${summary.label} ${fmtEUR(summary.totalHT)}`).join(" | "),
    );
  }
  rows.push(
    "TVA 20 % : " +
      summaries.map((summary) => `${summary.label} ${fmtEUR(summary.vat)}`).join(" | "),
  );
  rows.push(
    "Total TTC : " +
      summaries.map((summary) => `${summary.label} ${fmtEUR(summary.totalTTC)}`).join(" | "),
  );
  return rows;
}

function buildPlainTextMultiQuantityEmail(params: {
  clientName: string;
  contactName: string;
  reference: string;
  objet: string;
  summaries: OfferScenarioSummary[];
  transportCondition: string;
  outillageIncluded: boolean;
  carbon: CarbonEstimateResult | null;
  commonInfo: OfferCommonInfo | null;
  showGlobalTotals: boolean;
  showLineSubtotals: boolean;
  toolingPresentation: ToolingPresentation;
}) {
  const {
    clientName,
    contactName,
    reference,
    objet,
    summaries: sourceSummaries,
    transportCondition,
    outillageIncluded,
    carbon,
    commonInfo,
    showGlobalTotals,
    showLineSubtotals,
    toolingPresentation,
  } = params;
  const { summaries, globalToolingHT } = prepareToolingSummaries(
    sourceSummaries,
    toolingPresentation,
  );
  const greeting = contactName ? `Bonjour ${contactName},` : "Bonjour,";
  const mainDetails = collectDetails(summaries.map((summary) => summary.mainRows));
  const mainRows = collectMainRows(summaries);
  const optionRows = collectOptionRows(summaries);
  const showDetailedLines = !showGlobalTotals && showLineSubtotals;
  const hasOptions = summaries.some((summary) => summary.optionsTotalHT > 0);

  return [
    greeting,
    "",
    `Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée pour : ${objet}.`,
    clientName ? `Client : ${clientName}` : "",
    reference ? `Dossier : ${reference}` : "",
    "",
    ...buildCommonOfferInfoPlainText(commonInfo),
    commonInfo ? "" : "",
    ...(showDetailedLines
      ? mainRows.flatMap((mainRow) => {
          const prices = summaries.map((summary) => {
            const row = findMainForScenario(summary, mainRow);
            return row
              ? `${summary.label} : PU HT ${fmtEUR(row.unitPrice)} / u - Sous-total HT ${fmtEUR(rowTotal(row))}`
              : `${summary.label} : non chiffrée`;
          });
          return [
            `- ${mainRow.designation}`,
            ...buildPlainDetailLines(mainRow.details ?? [], "  "),
            ...prices.map((price) => `  ${price}`),
          ];
        })
      : [
          objet,
          ...buildPlainDetailLines(mainDetails),
          "",
          "Prix HT tout inclus :",
          ...summaries.map((summary) =>
            buildPlainQuantityPrice(summary, summary.mainTotalHT, showLineSubtotals),
          ),
        ]),
    toolingPresentation === "global" ? buildGlobalToolingPlainText(globalToolingHT) : "",
    hasOptions ? "" : "",
    hasOptions ? "Options :" : "",
    ...optionRows.flatMap((option) => {
      const prices = summaries.map((summary) => {
        const row = findOptionForScenario(summary, option);
        return row
          ? `${summary.label} : PU HT ${fmtEUR(row.unitPrice)} / u${showLineSubtotals ? ` - Sous-total HT ${fmtEUR(rowTotal(row))}` : ""}`
          : `${summary.label} : non chiffrée`;
      });
      return [
        `- ${option.designation}`,
        ...buildPlainDetailLines(option.details ?? [], "  "),
        ...prices.map((price) => `  ${price}`),
      ];
    }),
    "",
    ...(showGlobalTotals ? buildPlainTotalsRows(sourceSummaries, hasOptions) : []),
    "",
    ...buildCarbonPlainText(
      carbon,
      summaries.map((summary) => ({ label: summary.label, quantity: summary.quantity })),
    ),
    "Conditions :",
    "Offre indicative valable 8 jours, sous réserve de validation technique et de disponibilité.",
    transportCondition,
    outillageIncluded ? "Outillage inclus." : "",
    "Si cette proposition vous convient, nous vous transmettrons ensuite le devis officiel.",
    "",
    "Le Yeti vous remercie pour votre confiance.",
  ]
    .filter(Boolean)
    .join("\n");
}

function getMultiQuantityMailLayout(quantityCount: number) {
  const columnWidth = 170;
  const mailWidth = Math.max(920, 340 + Math.max(1, quantityCount) * columnWidth);
  return { columnWidth, mailWidth };
}

function buildHtmlMultiQuantityEmail(params: {
  clientName: string;
  contactName: string;
  clientEmail: string;
  reference: string;
  objet: string;
  image: MailImage | null;
  summaries: OfferScenarioSummary[];
  transportCondition: string;
  outillageIncluded: boolean;
  carbon: CarbonEstimateResult | null;
  commonInfo: OfferCommonInfo | null;
  showGlobalTotals: boolean;
  showLineSubtotals: boolean;
  toolingPresentation: ToolingPresentation;
}) {
  const {
    clientName,
    contactName,
    clientEmail,
    reference,
    objet,
    image,
    summaries: sourceSummaries,
    transportCondition,
    outillageIncluded,
    carbon,
    commonInfo,
    showGlobalTotals,
    showLineSubtotals,
    toolingPresentation,
  } = params;
  const { summaries, globalToolingHT } = prepareToolingSummaries(
    sourceSummaries,
    toolingPresentation,
  );
  const greeting = contactName ? `Bonjour ${escapeHtml(contactName)},` : "Bonjour,";
  const mainDetails = collectDetails(summaries.map((summary) => summary.mainRows));
  const mainRows = collectMainRows(summaries);
  const optionRows = collectOptionRows(summaries);
  const showDetailedLines = !showGlobalTotals && showLineSubtotals;
  const hasOptions = summaries.some((summary) => summary.optionsTotalHT > 0);
  const { columnWidth, mailWidth } = getMultiQuantityMailLayout(summaries.length);

  const detailHtml = (details: string[] | undefined) =>
    details?.length
      ? `<div style="margin-top:6px;padding-top:5px;border-top:1px solid ${MAIL_BORDER};color:${MAIL_MUTED};font-size:11px;line-height:1.35;">
          ${details.map(buildDetailHtml).join("")}
        </div>`
      : "";

  const priceTable = (
    title: string,
    details: string[],
    totalLabel: string,
    totalForSummary: (summary: OfferScenarioSummary) => number,
  ) =>
    summaries.length
      ? `<tr>
      <td style="padding:0 0 14px 0;">
        <div style="padding:0 0 6px 0;color:${YETI_ORANGE};font-weight:700;text-transform:uppercase;font-size:11px;">${escapeHtml(title)}</div>
        <table cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid ${MAIL_BORDER};font-family:${FONT};">
          <thead>
            <tr>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:left;font-size:11px;text-transform:uppercase;">Désignation</th>
              ${summaries
                .map(
                  (summary) =>
                    `<th style="padding:7px 10px;background:${MAIL_SOFT};color:${YETI_ORANGE};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">${escapeHtml(summary.label)}</th>`,
                )
                .join("")}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};color:${MAIL_TEXT};font-size:12px;vertical-align:top;overflow-wrap:break-word;">
                <div style="font-weight:700;">${escapeHtml(totalLabel)}</div>
                ${detailHtml(details)}
              </td>
              ${summaries
                .map((summary) => {
                  const total = totalForSummary(summary);
                  return `<td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;white-space:nowrap;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">
                    <div style="font-weight:800;font-size:14px;">${escapeHtml(fmtEUR(unitPriceFromTotal(summary, total)))} / u</div>
                    ${showLineSubtotals ? `<div style="font-size:10.5px;color:${MAIL_MUTED};margin-top:2px;">Sous-total HT ${escapeHtml(fmtEUR(total))}</div>` : ""}
                  </td>`;
                })
                .join("")}
            </tr>
          </tbody>
        </table>
      </td>
    </tr>`
      : "";

  const totalsRow = (label: string, valueForSummary: (summary: OfferScenarioSummary) => number) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid ${MAIL_BORDER};color:${MAIL_MUTED};font-size:12px;font-weight:700;">${escapeHtml(label)}</td>
      ${sourceSummaries
        .map(
          (summary) =>
            `<td style="padding:6px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;font-weight:700;white-space:nowrap;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">${escapeHtml(fmtEUR(valueForSummary(summary)))}</td>`,
        )
        .join("")}
    </tr>`;

  const unitPriceTable = `
    <tr>
      <td style="padding:0 0 14px 0;">
        <div style="padding:0 0 6px 0;color:${YETI_ORANGE};font-weight:700;text-transform:uppercase;font-size:11px;">Prix unitaire (offre et options incluses${toolingPresentation === "global" ? ", hors outillage" : ""})</div>
        <table cellpadding="0" cellspacing="0" bgcolor="#fff4c2" style="forced-color-adjust:none;print-color-adjust:exact;-webkit-print-color-adjust:exact;width:100%;border-collapse:collapse;border:1px solid ${MAIL_BORDER};font-family:${FONT};">
          <tbody>
            <tr>
              <td bgcolor="#fff4c2" style="background-color:#fff4c2 !important;padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};color:${MAIL_TEXT} !important;font-size:12px;font-weight:700;">Prix unitaire HT</td>
              ${summaries.map((summary) => `<td bgcolor="#fff4c2" style="background-color:#fff4c2 !important;padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT} !important;font-size:13px;font-weight:800;white-space:nowrap;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">${escapeHtml(fmtEUR(unitPriceFromTotal(summary, summary.totalHT)))} / u</td>`).join("")}
            </tr>
            <tr>
              <td bgcolor="#fff4c2" style="background-color:#fff4c2 !important;padding:8px 10px;color:${MAIL_TEXT} !important;font-size:12px;font-weight:700;">Prix unitaire TTC</td>
              ${summaries.map((summary) => `<td bgcolor="#fff4c2" style="background-color:#fff4c2 !important;padding:8px 10px;text-align:right;color:${MAIL_TEXT} !important;font-size:14px;font-weight:800;white-space:nowrap;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">${escapeHtml(fmtEUR(unitPriceFromTotal(summary, summary.totalTTC)))} / u</td>`).join("")}
            </tr>
          </tbody>
        </table>
      </td>
    </tr>`;

  const mainLinePriceTable = () =>
    mainRows.length
      ? `<tr>
      <td style="padding:0 0 14px 0;">
        <div style="padding:0 0 6px 0;color:${YETI_ORANGE};font-weight:700;text-transform:uppercase;font-size:11px;">${escapeHtml(objet || "Détail de l’offre")}</div>
        <table cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid ${MAIL_BORDER};font-family:${FONT};">
          <thead><tr>
            <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:left;font-size:11px;text-transform:uppercase;">Désignation</th>
            ${summaries.map((summary) => `<th style="padding:7px 10px;background:${MAIL_SOFT};color:${YETI_ORANGE};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">${escapeHtml(summary.label)}</th>`).join("")}
          </tr></thead>
          <tbody>
            ${mainRows
              .map(
                (mainRow) => `<tr>
              <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};color:${MAIL_TEXT};font-size:12px;vertical-align:top;overflow-wrap:break-word;">
                <div style="font-weight:700;">${escapeHtml(mainRow.designation)}</div>
                ${detailHtml(mainRow.details)}
              </td>
              ${summaries
                .map((summary) => {
                  const row = findMainForScenario(summary, mainRow);
                  return `<td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;white-space:nowrap;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">
                  ${row ? `<div style="font-weight:800;font-size:14px;">${escapeHtml(fmtEUR(row.unitPrice))} / u</div><div style="font-size:10.5px;color:${MAIL_MUTED};margin-top:2px;">Sous-total HT ${escapeHtml(fmtEUR(rowTotal(row)))}</div>` : `<div>—</div>`}
                </td>`;
                })
                .join("")}
            </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </td>
    </tr>`
      : "";

  const optionPriceTable = () =>
    optionRows.length
      ? `<tr>
      <td style="padding:0 0 14px 0;">
        <div style="padding:0 0 6px 0;color:${YETI_ORANGE};font-weight:700;text-transform:uppercase;font-size:11px;">Options</div>
        <table cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid ${MAIL_BORDER};font-family:${FONT};">
          <thead><tr>
            <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:left;font-size:11px;text-transform:uppercase;">Désignation</th>
            ${summaries.map((summary) => `<th style="padding:7px 10px;background:${MAIL_SOFT};color:${YETI_ORANGE};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">${escapeHtml(summary.label)}</th>`).join("")}
          </tr></thead>
          <tbody>
            ${optionRows
              .map(
                (option) => `<tr>
              <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};color:${MAIL_TEXT};font-size:12px;vertical-align:top;overflow-wrap:break-word;">
                <div style="font-weight:700;">${escapeHtml(option.designation)}</div>
                ${detailHtml(option.details)}
              </td>
              ${summaries
                .map((summary) => {
                  const row = findOptionForScenario(summary, option);
                  return `<td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;white-space:nowrap;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">
                  ${row ? `<div style="font-weight:800;font-size:14px;">${escapeHtml(fmtEUR(row.unitPrice))} / u</div>${showLineSubtotals ? `<div style="font-size:10.5px;color:${MAIL_MUTED};margin-top:2px;">Sous-total HT ${escapeHtml(fmtEUR(rowTotal(row)))}</div>` : ""}` : `<div>—</div>`}
                </td>`;
                })
                .join("")}
            </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </td>
    </tr>`
      : "";

  const globalTotalsTable = `
    <tr>
      <td style="padding:0 0 16px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid ${MAIL_BORDER};font-family:${FONT};">
          <thead>
            <tr>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:left;font-size:11px;text-transform:uppercase;">Total</th>
              ${sourceSummaries
                .map(
                  (summary) =>
                    `<th style="padding:7px 10px;background:${MAIL_SOFT};color:${YETI_ORANGE};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">${escapeHtml(summary.label)}</th>`,
                )
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${hasOptions ? totalsRow("Total offre principale HT", (summary) => summary.mainTotalHT) : ""}
            ${hasOptions ? totalsRow("Total options HT", (summary) => summary.optionsTotalHT) : ""}
            ${totalsRow("Total général HT", (summary) => summary.totalHT)}
            ${totalsRow("TVA 20 %", (summary) => summary.vat)}
            <tr>
              <td style="padding:9px 10px;border-top:2px solid ${YETI_ORANGE};color:${MAIL_TEXT};font-size:12px;font-weight:700;">Total TTC</td>
              ${sourceSummaries
                .map(
                  (summary) =>
                    `<td style="padding:9px 10px;border-top:2px solid ${YETI_ORANGE};text-align:right;color:${YETI_ORANGE};font-size:14px;font-weight:800;white-space:nowrap;width:${columnWidth}px;box-sizing:border-box;vertical-align:top;">${escapeHtml(fmtEUR(summary.totalTTC))}</td>`,
                )
                .join("")}
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
`;

  return `
<div style="margin:0;padding:0;background:#ffffff;color:${MAIL_TEXT};font-family:${FONT};font-size:12.5px;line-height:1.4;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="${mailWidth}" style="width:${mailWidth}px;max-width:${mailWidth}px;border-collapse:collapse;font-family:${FONT};">
    <tr>
      <td style="padding:0 0 12px 0;color:${MAIL_TEXT};">
        <p style="margin:0 0 8px 0;">${greeting}</p>
        <p style="margin:0;">Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée.</p>
      </td>
    </tr>
    ${buildCarbonHtmlRow(
      carbon,
      summaries.map((summary) => ({ label: summary.label, quantity: summary.quantity })),
    )}
    <tr>
      <td style="padding:0 0 14px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid ${MAIL_BORDER};border-left:3px solid ${YETI_ORANGE};">
          <tr>
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;width:130px;">Client</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(clientName || "-")}</td>
          </tr>
          ${
            clientEmail
              ? `<tr><td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Email</td><td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(clientEmail)}</td></tr>`
              : ""
          }
          <tr>
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Référence</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(objet || "-")}</td>
          </tr>
          <tr>
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Date</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(formatDate())}</td>
          </tr>
          ${
            reference
              ? `<tr><td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Dossier</td><td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(reference)}</td></tr>`
              : ""
          }
        </table>
      </td>
    </tr>
    ${buildMailImageRow(image)}
    ${buildCommonOfferInfoHtmlRow(commonInfo)}
    ${showDetailedLines ? mainLinePriceTable() : priceTable(objet || "Offre principale", mainDetails, "Prix HT tout inclus", (summary) => summary.mainTotalHT)}
    ${toolingPresentation === "global" ? buildGlobalToolingHtmlRow(globalToolingHT) : ""}
    ${hasOptions ? optionPriceTable() : ""}
    ${showDetailedLines ? "" : unitPriceTable}
    ${showGlobalTotals ? globalTotalsTable : ""}
    <tr>
      <td style="padding:10px 12px;border:1px solid ${MAIL_BORDER};border-left:3px solid ${YETI_ORANGE};background:#fffaf6;color:${MAIL_TEXT};font-size:12px;">
        <p style="margin:0 0 6px 0;color:${YETI_ORANGE};font-weight:700;">Conditions</p>
        <p style="margin:0 0 5px 0;">Offre indicative valable 8 jours, sous réserve de validation technique et de disponibilité.</p>
        <p style="margin:0 0 5px 0;">${escapeHtml(transportCondition)}</p>
        ${outillageIncluded ? `<p style="margin:0 0 5px 0;">Outillage inclus.</p>` : ""}
        <p style="margin:0 0 5px 0;">Si cette proposition vous convient, nous vous transmettrons ensuite le devis officiel.</p>
        <p style="margin:0;">Le Yeti vous remercie pour votre confiance.</p>
      </td>
    </tr>
  </table>
</div>`;
}

async function copyRichEmail(html: string, plainText: string) {
  const nav = navigator as Navigator & {
    clipboard?: Clipboard & {
      write?: (items: ClipboardItem[]) => Promise<void>;
    };
  };

  if (nav.clipboard?.write && "ClipboardItem" in window) {
    const ClipboardItemCtor = (window as any).ClipboardItem;
    await nav.clipboard.write([
      new ClipboardItemCtor({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plainText], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  await navigator.clipboard.writeText(plainText);
}

function buildPdfDocument(offer: { subject: string; html: string; previewWidth: number }) {
  const printableWidth = 715;
  const scale = Math.min(1, printableWidth / offer.previewWidth);
  const title = offer.subject
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title || "Offre de prix Yeti Factory")}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #fff; color: #222; }
      body {
        font-family: ${FONT};
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .pdf-actions {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 18px;
        border-bottom: 1px solid #ddd;
        background: #fff;
        font: 14px Arial, sans-serif;
      }
      .pdf-actions button {
        border: 0;
        border-radius: 6px;
        padding: 10px 16px;
        background: ${YETI_ORANGE};
        color: #fff;
        font-weight: 700;
        cursor: pointer;
      }
      .offer-print-root {
        width: ${offer.previewWidth}px;
        margin: 18px auto;
        transform-origin: top left;
      }
      img { max-width: 100%; }
      @media print {
        .pdf-actions { display: none !important; }
        .offer-print-root {
          margin: 0;
          zoom: ${scale.toFixed(4)};
        }
        img {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <div class="pdf-actions">
      <span>Choisissez « Enregistrer au format PDF » dans la fenêtre d’impression.</span>
      <button type="button" onclick="window.print()">Enregistrer le PDF</button>
    </div>
    <div class="offer-print-root">${offer.html}</div>
  </body>
</html>`;
}

async function waitForPrintContent(printWindow: Window) {
  const doc = printWindow.document;
  const images = Array.from(doc.images);
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
  await doc.fonts?.ready;
}

export function OfferEmailDialog({
  dossier,
  meta,
  payload,
  output,
  onImageChange,
}: OfferEmailDialogProps) {
  const scenarioItems: ScenarioItem[] = (output?.scenarios ?? [])
    .map((scenario: any, index: number) => ({ scenario, index }))
    .filter((item: ScenarioItem) => Number(item.scenario.quantite) > 0);
  const isStandOffer = dossier?.type === "stands";
  const [scenarioIndex, setScenarioIndex] = useState("0");
  const savedMailImage = useMemo(
    () => normalizeMailImage(payload?.offerMailImage),
    [payload?.offerMailImage],
  );
  const [mailImage, setMailImage] = useState<MailImage | null>(savedMailImage);
  const [imageEnabled, setImageEnabled] = useState(
    savedMailImage?.enabled !== false && !!savedMailImage,
  );
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [showGlobalTotals, setShowGlobalTotals] = useState(true);
  const [showLineSubtotals, setShowLineSubtotals] = useState(true);
  const [toolingPresentation, setToolingPresentation] =
    useState<ToolingPresentation>("distributed");
  const selectedIndex = Math.min(Number(scenarioIndex) || 0, Math.max(0, scenarioItems.length - 1));
  const selectedItem = scenarioItems[selectedIndex];
  const scenario = selectedItem?.scenario;
  const hasTooling =
    Math.abs(Number(payload?.outillage?.montantGlobal) || 0) > 0.005 ||
    scenarioItems.some((item) => Math.abs(Number(item.scenario.outillageGlobal) || 0) > 0.005);

  useEffect(() => {
    setMailImage(savedMailImage);
    setImageEnabled(savedMailImage?.enabled !== false && !!savedMailImage);
  }, [savedMailImage]);

  async function handleImageChange(file: File | undefined) {
    if (!file || isPreparingImage) return;
    setIsPreparingImage(true);
    try {
      const image = { ...(await prepareMailImage(file)), enabled: true };
      setMailImage(image);
      setImageEnabled(true);
      onImageChange?.(image);
      toast.success("Image ajoutée à l'offre mail");
    } catch (error: any) {
      toast.error(error?.message ?? "Impossible d'ajouter l'image");
    } finally {
      setIsPreparingImage(false);
    }
  }

  function toggleImage(enabled: boolean) {
    setImageEnabled(enabled);
    if (mailImage) {
      const image = { ...mailImage, enabled };
      setMailImage(image);
      onImageChange?.(image);
    }
  }

  const offer = useMemo(() => {
    if (scenarioItems.length === 0) return null;

    const clientName = cleanLabel(dossier?.clients?.entreprise, "");
    const contactName = buildOfferContactName(dossier);
    const clientEmail = cleanLabel(dossier?.email || dossier?.clients?.email, "");
    const reference = cleanLabel(meta.reference, "");
    const objet = cleanLabel(meta.objet, dossier?.objet || "Offre de prix");
    const subject = `Offre de prix - ${clientName || "Client"} - ${objet}`;
    const carbon = calculateCarbonEstimate(payload?.carbonEstimate);
    const prototype = normalizeOfferPrototype(payload?.offerPrototype);
    const commonInfo = normalizeOfferCommonInfo(payload?.offerCommonInfo);

    if (dossier?.type !== "stands") {
      const detailedMainRows = !showGlobalTotals && showLineSubtotals;
      const summaries = scenarioItems.map((item) =>
        buildScenarioSummary(dossier?.type, payload, output, item, "Base", detailedMainRows),
      );
      const transportCondition = buildTransportCondition(payload, scenarioItems);
      const outillageIncluded =
        Math.abs(Number(payload?.outillage?.montantGlobal) || 0) > 0.005 ||
        scenarioItems.some((item) => {
          const outillageGlobal = Number(item.scenario.outillageGlobal) || 0;
          const outillageUnit = Number(item.scenario.outillageUnit) || 0;
          return Math.abs(outillageGlobal) > 0.005 || Math.abs(outillageUnit) > 0.005;
        });
      const plainText = buildPlainTextMultiQuantityEmail({
        clientName,
        contactName,
        reference,
        objet,
        summaries,
        transportCondition,
        outillageIncluded,
        carbon,
        commonInfo,
        showGlobalTotals,
        showLineSubtotals,
        toolingPresentation,
      });
      const html = buildHtmlMultiQuantityEmail({
        clientName,
        contactName,
        clientEmail,
        reference,
        objet,
        image: imageEnabled ? mailImage : null,
        summaries,
        transportCondition,
        outillageIncluded,
        carbon,
        commonInfo,
        showGlobalTotals,
        showLineSubtotals,
        toolingPresentation,
      });
      const { mailWidth: previewWidth } = getMultiQuantityMailLayout(scenarioItems.length);

      return {
        subject,
        plainText: appendPrototypePlainText(plainText, prototype),
        html: appendPrototypeHtml(html, prototype),
        previewWidth,
      };
    }

    if (!scenario || !selectedItem) return null;

    const detailedMainRows = !showGlobalTotals && showLineSubtotals;
    const rawRows = buildOfferRows(
      dossier?.type,
      payload,
      output,
      scenario,
      selectedItem.index,
      "Base",
      detailedMainRows,
    );
    const rows = reconcileRows(distributeFixedFees(rawRows, scenario), scenario);
    const mainRows = rows.filter((row) => !row.isOption);
    const optionRows = rows.filter((row) => row.isOption);
    const mainTotalHT = rowsTotal(mainRows);
    const optionsTotalHT = rowsTotal(optionRows);
    const totalHT = mainTotalHT + optionsTotalHT;
    const vat = totalHT * 0.2;
    const totalTTC = totalHT + vat;
    const plainText = buildPlainTextEmail({
      subject,
      clientName,
      contactName,
      reference,
      objet,
      mainRows,
      optionRows,
      mainTotalHT,
      optionsTotalHT,
      totalHT,
      vat,
      totalTTC,
      carbon,
      commonInfo,
      quantity: Number(scenario.quantite) || 0,
      showGlobalTotals,
      showLineSubtotals,
    });
    const html = buildHtmlEmail({
      clientName,
      contactName,
      clientEmail,
      reference,
      objet,
      image: imageEnabled ? mailImage : null,
      mainRows,
      optionRows,
      mainTotalHT,
      optionsTotalHT,
      totalHT,
      vat,
      totalTTC,
      carbon,
      commonInfo,
      quantity: Number(scenario.quantite) || 0,
      showGlobalTotals,
      showLineSubtotals,
    });
    const previewWidth = 760;

    return {
      subject,
      plainText: appendPrototypePlainText(plainText, prototype),
      html: appendPrototypeHtml(html, prototype),
      previewWidth,
    };
  }, [
    dossier,
    mailImage,
    imageEnabled,
    meta,
    output,
    payload,
    scenario,
    scenarioItems,
    selectedItem,
    showGlobalTotals,
    showLineSubtotals,
    toolingPresentation,
  ]);

  async function copyBody() {
    if (!offer) return;
    try {
      await copyRichEmail(offer.html, offer.plainText);
      toast.success("Offre mail copiée");
    } catch (error: any) {
      toast.error(error?.message ?? "Impossible de copier l'offre mail");
    }
  }

  async function copySubject() {
    if (!offer) return;
    try {
      await navigator.clipboard.writeText(offer.subject);
      toast.success("Objet copié");
    } catch (error: any) {
      toast.error(error?.message ?? "Impossible de copier l'objet");
    }
  }

  function createPdf() {
    if (!offer) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error(
        "Le navigateur a bloqué l’ouverture du PDF. Autorisez les fenêtres pop-up puis réessayez.",
      );
      return;
    }

    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(buildPdfDocument(offer));
    printWindow.document.close();

    void waitForPrintContent(printWindow)
      .then(() => {
        printWindow.focus();
        printWindow.print();
      })
      .catch(() => {
        toast.error("Impossible de préparer le PDF de l’offre");
      });
  }

  function removeImage() {
    setMailImage(null);
    onImageChange?.(null);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={scenarioItems.length === 0}>
          <Mail className="w-4 h-4 mr-1.5" />
          Générer offre mail
        </Button>
      </DialogTrigger>
      <DialogContent
        className="h-[96vh] w-[98vw] max-w-none overflow-y-auto p-6"
        onPaste={(event) => {
          if (!imageEnabled || isPreparingImage) return;
          const item = Array.from(event.clipboardData.items).find(
            (item) => item.kind === "file" && item.type.startsWith("image/"),
          );
          const file = item?.getAsFile();
          if (file) {
            event.preventDefault();
            void handleImageChange(file);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Offre à coller dans le mail</DialogTitle>
          <DialogDescription>
            Le corps du mail est généré depuis le calcul. Copiez-le puis collez-le directement dans
            Outlook, Gmail ou votre client mail. Les compositions sont affichées sans fournisseur et
            sans prix de détail.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4">
            {isStandOffer ? (
              <div className="space-y-2">
                <Label>Quantité proposée</Label>
                <Select value={String(selectedIndex)} onValueChange={setScenarioIndex}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scenarioItems.map((item, index: number) => (
                      <SelectItem key={item.index} value={String(index)}>
                        Qté {Number(item.scenario.quantite).toLocaleString("fr-FR")} -{" "}
                        {fmtEUR(item.scenario.totalCA)} HT
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Toutes les quantités saisies seront intégrées dans l’offre, avec une colonne par
                quantité.
              </div>
            )}

            <div className="space-y-2">
              <Label>Objet du mail</Label>
              <Textarea readOnly value={offer?.subject ?? ""} className="min-h-20 text-sm" />
            </div>

            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="offer-image-enabled"
                  checked={imageEnabled}
                  disabled={isPreparingImage}
                  onCheckedChange={(checked) => toggleImage(checked === true)}
                />
                <Label htmlFor="offer-image-enabled" className="cursor-pointer">
                  Ajouter une image à l'offre
                </Label>
              </div>
              {imageEnabled && (
                <div className="space-y-3">
                  <div
                    role="group"
                    aria-label="Ajouter un plan ou une photo à l'offre"
                    tabIndex={0}
                    className="space-y-2 rounded-md border-2 border-dashed p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = isPreparingImage ? "none" : "copy";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (isPreparingImage) return;
                      const files = Array.from(event.dataTransfer.files);
                      const file = files.find((file) => file.type.startsWith("image/")) ?? files[0];
                      void handleImageChange(file);
                    }}
                  >
                    <ImagePlus className="h-6 w-6 text-muted-foreground" />
                    <Label htmlFor="offer-image" className="block cursor-pointer">
                      Glissez un plan ou une photo ici
                    </Label>
                    <Input
                      id="offer-image"
                      type="file"
                      accept="image/*"
                      disabled={isPreparingImage}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void handleImageChange(file);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Ou collez une image avec Ctrl+V (⌘V sur Mac) dans cette fenêtre. Le visuel
                      sera intégré à l'offre, avant les prix.
                    </p>
                    {isPreparingImage && (
                      <p role="status" className="text-xs">
                        Préparation de l'image…
                      </p>
                    )}
                  </div>
                  {mailImage && (
                    <div className="space-y-2">
                      <div className="overflow-hidden rounded-md border bg-white">
                        <img
                          src={mailImage.src}
                          alt={mailImage.name}
                          className="max-h-32 w-full object-contain"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{mailImage.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          disabled={isPreparingImage}
                          onClick={removeImage}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          Retirer
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isStandOffer && hasTooling && (
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <Label htmlFor="offer-tooling-presentation">Présentation de l’outillage</Label>
                <Select
                  value={toolingPresentation}
                  onValueChange={(value) => setToolingPresentation(value as ToolingPresentation)}
                >
                  <SelectTrigger id="offer-tooling-presentation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="distributed">Dispatcher par quantité</SelectItem>
                    <SelectItem value="global">Présenter en montant global</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  En montant global, l’outillage apparaît une seule fois et n’est plus intégré aux
                  prix unitaires présentés.
                </p>
              </div>
            )}

            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="offer-global-totals"
                  checked={showGlobalTotals}
                  onCheckedChange={(checked) => setShowGlobalTotals(checked === true)}
                />
                <Label htmlFor="offer-global-totals" className="cursor-pointer">
                  Afficher le budget global
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Décochez cette option lorsque plusieurs versions sont proposées et que le client
                doit d’abord en choisir une. Les prix détaillés et unitaires restent affichés.
              </p>
              {!showGlobalTotals && (
                <div className="mt-3 border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="offer-line-subtotals"
                      checked={showLineSubtotals}
                      onCheckedChange={(checked) => setShowLineSubtotals(checked === true)}
                    />
                    <Label htmlFor="offer-line-subtotals" className="cursor-pointer">
                      Afficher les sous-totaux de chaque ligne
                    </Label>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Chaque ligne conserve son prix unitaire et peut afficher son propre sous-total
                    HT, sans total général.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={copyBody} disabled={!offer}>
                <Clipboard className="w-4 h-4 mr-1.5" />
                Copier le corps du mail
              </Button>
              <Button variant="outline" onClick={createPdf} disabled={!offer}>
                <FileDown className="w-4 h-4 mr-1.5" />
                Créer le PDF de l’offre
              </Button>
              <Button variant="outline" onClick={copySubject} disabled={!offer}>
                Copier l'objet
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Le PDF reprend l’offre affichée et peut être joint à un message WhatsApp. Dans la
              fenêtre d’impression, choisissez « Enregistrer au format PDF ». Le collage riche garde
              la mise en forme quand le navigateur l'autorise. Sinon, le texte simple est copié
              automatiquement.
            </p>
          </div>

          <div className="min-w-0 rounded-md border bg-muted/20 p-4 shadow-inner overflow-x-auto">
            <p className="mb-3 text-xs text-muted-foreground">
              Aperçu du contenu copié dans le mail, à taille réelle. Faites défiler horizontalement
              si toutes les quantités ne tiennent pas à l’écran.
            </p>
            <iframe
              title="Aperçu du mail"
              sandbox="allow-same-origin"
              className="block border-0 bg-white"
              style={{ width: offer?.previewWidth ?? 920, maxWidth: "none", height: 320 }}
              srcDoc={`<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>Aperçu du mail</title></head><body style="margin:0;background:#fff;">${offer?.html ?? ""}</body></html>`}
              onLoad={(event) => {
                const frame = event.currentTarget;
                frame.style.height = "320px";
                const contentHeight = frame.contentDocument?.documentElement.scrollHeight;
                if (contentHeight) frame.style.height = `${Math.max(320, contentHeight)}px`;
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
