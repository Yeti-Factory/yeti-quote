import { useMemo, useState } from "react";
import { Clipboard, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  resolveContraMargePct,
  sanitizeContraInput,
} from "@/lib/calculs/contra";
import { getPrixAchat, resolveMargePct } from "@/lib/calculs/types";
import { formatClientGreetingName } from "@/lib/client-contact";
import { fmtEUR } from "@/lib/format";

type OfferRow = {
  designation: string;
  quantity: number;
  unitPrice: number;
  details?: string[];
  isOption?: boolean;
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
};

const FONT = '"Avenir LT Pro Book 45", "Avenir LT Pro", Avenir, Arial, Helvetica, sans-serif';
const YETI_ORANGE = "#ff7900";
const MAIL_TEXT = "#222222";
const MAIL_MUTED = "#666666";
const MAIL_BORDER = "#eadfd7";
const MAIL_SOFT = "#fff7f0";

const MAIL_DESIGNATION_WIDTH = 460;
const MAIL_DETAIL_WIDTH = 430;
const MAIL_PRICE_COL_MIN = 118;
const MAIL_PRICE_COL_MAX = 160;

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

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isOptionLabel(value: unknown) {
  return /\boptions?\b/.test(normalizeSearch(value));
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
) {
  if (!Number.isFinite(unitPrice) || Math.abs(unitPrice) < 0.005) return;
  rows.push({
    designation: cleanLabel(designation, "Prestation"),
    quantity,
    unitPrice,
    details: cleanDetails(details),
    isOption,
  });
}

function buildStandardRows(
  payload: any,
  scenario: any,
  scenarioIndex: number,
  primaryDesignation = "Achats principaux",
): OfferRow[] {
  const rows: OfferRow[] = [];
  const quantite = Number(scenario.quantite) || 0;
  const quantiteMarge = payload?.quantites?.[scenarioIndex]?.margePct ?? null;
  const defaultMarge = Number(payload?.params?.coef_marge_pct) || 0;

  let achatsPrincipauxUnit = 0;
  const achatsPrincipauxDetails: string[] = [];
  let optionsUnit = 0;
  const optionsDetails: string[] = [];
  for (const [index, line] of (payload?.achatsPrincipaux ?? []).entries()) {
    const achat = getPrixAchat(line, scenarioIndex);
    const marge = resolveMargePct(line?.margePct, quantiteMarge, defaultMarge);
    const lineUnit = achat * (1 + marge / 100);
    const lineDetail = buildLineDetail(line, `Prestation ${index + 1}`);
    if (isOptionLabel(line?.libelle)) {
      optionsUnit += lineUnit;
      optionsDetails.push(lineDetail);
    } else {
      achatsPrincipauxUnit += lineUnit;
      achatsPrincipauxDetails.push(lineDetail);
    }
  }
  addRow(rows, primaryDesignation, quantite, achatsPrincipauxUnit, achatsPrincipauxDetails);
  addRow(rows, "Options", quantite, optionsUnit, optionsDetails, true);

  const tpUnit = Number(scenario.transportPackagingUnit) || 0;
  const tpMarge = Number(scenario.transportPackagingMargePct) || 0;
  addRow(rows, "Transport / Packaging", quantite, tpUnit * (1 + tpMarge / 100));

  const sourcingUnit = Number(scenario.commissionSourcingUnit) || 0;
  const sourcingMarge = resolveMargePct(null, quantiteMarge, defaultMarge);
  addRow(rows, "Commission sourcing", quantite, sourcingUnit * (1 + sourcingMarge / 100));

  addRow(rows, "Commission rapporteur", quantite, Number(scenario.commissionRapporteurUnit) || 0);
  addRow(rows, "Frais fixes", quantite, quantite > 0 ? Number(scenario.fraisFixes) / quantite : 0);

  return rows;
}

function buildContraRows(
  rawPayload: any,
  scenario: any,
  scenarioIndex: number,
  primaryDesignation = "Achats chez Contra",
): OfferRow[] {
  // Mêmes règles que le calcul : ligne confirmée > quantité confirmée > 25 %.
  const payload = sanitizeContraInput(rawPayload);
  const rows: OfferRow[] = [];
  const quantite = Number(scenario.quantite) || 0;
  const quantiteRow = payload?.quantites?.[scenarioIndex];
  const quantiteMarge = quantiteRow?.margePct ?? null;
  const quantiteConfirmed = quantiteRow?.margeConfirmed;
  const coefContra = Number(payload?.params?.coef_contra_pct) || 0;
  const margeFor = (m: number | null | undefined, c: boolean | undefined) =>
    resolveContraMargePct(m, c, quantiteMarge, quantiteConfirmed);

  let achatsContraUnit = 0;
  const achatsContraDetails: string[] = [];
  let optionsContraUnit = 0;
  const optionsContraDetails: string[] = [];
  for (const [index, line] of (payload?.achatsContra ?? []).entries()) {
    const raw = getPrixAchat(line, scenarioIndex);
    const margeYeti = margeFor(line?.margePct, line?.margeConfirmed);
    const lineUnit = pvFromContraSharedRaw(raw, coefContra, margeYeti);
    const lineDetail = buildLineDetail(line, `Prestation Contra ${index + 1}`);
    if (isOptionLabel(line?.libelle)) {
      optionsContraUnit += lineUnit;
      optionsContraDetails.push(lineDetail);
    } else {
      achatsContraUnit += lineUnit;
      achatsContraDetails.push(lineDetail);
    }
  }
  addRow(rows, primaryDesignation, quantite, achatsContraUnit, achatsContraDetails);
  addRow(rows, "Options Contra", quantite, optionsContraUnit, optionsContraDetails, true);

  let forfaitsContraUnit = 0;
  const forfaitsContraDetails: string[] = [];
  let optionsForfaitsUnit = 0;
  const optionsForfaitsDetails: string[] = [];
  for (const [index, line] of (payload?.forfaitsContra ?? []).entries()) {
    const share = quantite > 0 ? (Number(line?.montantGlobal) || 0) / quantite : 0;
    const margeYeti = margeFor(line?.margePct, line?.margeConfirmed);
    const lineUnit = pvFromContraSharedRaw(share, coefContra, margeYeti);
    const lineDetail = buildLineDetail(line, `Forfait Contra ${index + 1}`);
    if (isOptionLabel(line?.libelle)) {
      optionsForfaitsUnit += lineUnit;
      optionsForfaitsDetails.push(lineDetail);
    } else {
      forfaitsContraUnit += lineUnit;
      forfaitsContraDetails.push(lineDetail);
    }
  }
  addRow(rows, "Forfaits Contra", quantite, forfaitsContraUnit, forfaitsContraDetails);
  addRow(
    rows,
    "Options forfaitaires Contra",
    quantite,
    optionsForfaitsUnit,
    optionsForfaitsDetails,
    true,
  );

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
  );

  addRow(rows, "Commission sourcing", quantite, Number(scenario.commissionSourcingUnit) || 0);
  addRow(rows, "Commission rapporteur", quantite, Number(scenario.commissionRapporteurUnit) || 0);
  addRow(rows, "Frais fixes", quantite, quantite > 0 ? Number(scenario.fraisFixes) / quantite : 0);

  return rows;
}

function buildStandRows(payload: any, output: any, scenario: any): OfferRow[] {
  const rows: OfferRow[] = [];
  const quantite = Number(scenario.quantite) || 0;
  const groups = output?.extra?.groupes ?? [];

  for (const [index, group] of groups.entries()) {
    const sectionLines = payload?.sections?.[index]?.lignes ?? [];
    const hasInputLines = sectionLines.length > 0;
    if (!hasInputLines && !(Number(group?.pvTotal) > 0)) continue;
    addRow(
      rows,
      group?.libelle || `Groupe ${index + 1}`,
      quantite,
      Number(group?.pvTotal) || 0,
      sectionLines.map((line: any, lineIndex: number) =>
        buildLineDetail(line, `Ligne ${lineIndex + 1}`),
      ),
      isOptionLabel(group?.libelle || payload?.sections?.[index]?.libelle),
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
) {
  if (type === "standard")
    return buildStandardRows(payload, scenario, scenarioIndex, primaryDesignation);
  if (type === "contra")
    return buildContraRows(payload, scenario, scenarioIndex, primaryDesignation);
  if (type === "stands") return buildStandRows(payload, output, scenario);
  return [];
}

function reconcileRows(rows: OfferRow[], scenario: any) {
  const expectedTotal = Number(scenario.totalCA) || 0;
  const currentTotal = rows.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0);
  const delta = expectedTotal - currentTotal;
  const quantity = Number(scenario.quantite) || 1;

  if (Math.abs(delta) > 0.01) {
    addRow(rows, "Ajustement calcul", quantity, delta / quantity);
  }

  return rows;
}

function rowTotal(row: OfferRow) {
  return row.unitPrice * row.quantity;
}

function rowsTotal(rows: OfferRow[]) {
  return rows.reduce((sum, row) => sum + rowTotal(row), 0);
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
) {
  const rawRows = buildOfferRows(
    type,
    payload,
    output,
    item.scenario,
    item.index,
    primaryDesignation,
  );
  return summarizeRows(reconcileRows(rawRows, item.scenario), item.scenario);
}

function buildPlainRows(rows: OfferRow[]) {
  return rows.flatMap((row) => [
    `- ${row.designation} - qté ${row.quantity.toLocaleString("fr-FR")} - PU HT ${fmtEUR(row.unitPrice)} - Total HT ${fmtEUR(rowTotal(row))}`,
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
  return `<div style="margin:2px 0;max-width:430px;">
    <div style="white-space:normal;overflow-wrap:break-word;word-break:normal;">&bull;&nbsp;${escapeHtml(label)}</div>
    ${
      description
        ? `<div style="margin:2px 0 0 12px;max-width:430px;color:${MAIL_MUTED};line-height:1.35;white-space:normal;overflow-wrap:break-word;word-break:normal;">${descriptionHtml}</div>`
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
  } = params;
  const greeting = contactName ? `Bonjour ${contactName},` : "Bonjour,";
  const hasOptions = optionRows.length > 0;

  return [
    greeting,
    "",
    `Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée pour : ${objet}.`,
    clientName ? `Client : ${clientName}` : "",
    reference ? `Référence interne : ${reference}` : "",
    "",
    hasOptions ? "Offre principale :" : "Détail de l'offre :",
    ...buildPlainRows(mainRows),
    hasOptions ? `Total offre principale HT : ${fmtEUR(mainTotalHT)}` : "",
    hasOptions ? "Options :" : "",
    ...buildPlainRows(optionRows),
    hasOptions ? `Total options HT : ${fmtEUR(optionsTotalHT)}` : "",
    "",
    hasOptions ? `Total général HT : ${fmtEUR(totalHT)}` : `Total HT : ${fmtEUR(totalHT)}`,
    `TVA 20 % : ${fmtEUR(vat)}`,
    `Total TTC : ${fmtEUR(totalTTC)}`,
    "",
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
  mainRows: OfferRow[];
  optionRows: OfferRow[];
  mainTotalHT: number;
  optionsTotalHT: number;
  totalHT: number;
  vat: number;
  totalTTC: number;
}) {
  const {
    clientName,
    contactName,
    clientEmail,
    reference,
    objet,
    mainRows,
    optionRows,
    mainTotalHT,
    optionsTotalHT,
    totalHT,
    vat,
    totalTTC,
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
          <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};color:${MAIL_TEXT};font-size:12px;width:460px;max-width:460px;">
            <div style="font-weight:700;white-space:normal;overflow-wrap:break-word;word-break:normal;">${escapeHtml(row.designation)}</div>
            ${detailHtml(row.details)}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;width:62px;">${escapeHtml(row.quantity.toLocaleString("fr-FR"))}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;white-space:nowrap;width:105px;">${escapeHtml(fmtEUR(row.unitPrice))}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;white-space:nowrap;font-weight:700;width:120px;">${escapeHtml(fmtEUR(rowTotal(row)))}</td>
        </tr>`,
      )
      .join("");
  const offerTable = (title: string, rows: OfferRow[], totalLabel: string, total: number) =>
    rows.length
      ? `<tr>
      <td style="padding:0 0 14px 0;">
        <div style="padding:0 0 6px 0;color:${YETI_ORANGE};font-weight:700;text-transform:uppercase;font-size:11px;">${escapeHtml(title)}</div>
        <table cellpadding="0" cellspacing="0" width="760" style="width:760px;border-collapse:collapse;border:1px solid ${MAIL_BORDER};font-family:${FONT};">
          <thead>
            <tr>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:left;font-size:11px;text-transform:uppercase;width:460px;">Désignation</th>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:62px;">Qté</th>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:105px;">PU HT</th>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${YETI_ORANGE};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:120px;">Total HT</th>
            </tr>
          </thead>
          <tbody>
            ${rowHtml(rows)}
            <tr>
              <td colspan="3" style="padding:8px 10px;text-align:right;background:#fffaf6;color:${MAIL_TEXT};font-size:12px;font-weight:700;">${escapeHtml(totalLabel)}</td>
              <td style="padding:8px 10px;text-align:right;background:#fffaf6;color:${MAIL_TEXT};font-size:12px;font-weight:800;white-space:nowrap;">${escapeHtml(fmtEUR(total))}</td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>`
      : "";

  return `
<div style="margin:0;padding:0;background:#ffffff;color:${MAIL_TEXT};font-family:${FONT};font-size:12.5px;line-height:1.4;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:840px;border-collapse:collapse;font-family:${FONT};">
    <tr>
      <td style="padding:0 0 12px 0;color:${MAIL_TEXT};">
        <p style="margin:0 0 8px 0;">${greeting}</p>
        <p style="margin:0;">Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée.</p>
      </td>
    </tr>
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
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Projet</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(objet || "-")}</td>
          </tr>
          <tr>
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Date</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(formatDate())}</td>
          </tr>
          ${
            reference
              ? `<tr><td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Référence</td><td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(reference)}</td></tr>`
              : ""
          }
        </table>
      </td>
    </tr>
    ${offerTable(
      hasOptions ? "Offre principale" : "Détail de l'offre",
      mainRows,
      hasOptions ? "Total offre principale HT" : "Total HT",
      mainTotalHT,
    )}
    ${offerTable("Options", optionRows, "Total options HT", optionsTotalHT)}
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

function buildTransportCondition(transportIncluded: boolean) {
  return transportIncluded ? "Transport inclus." : "EXW (départ) nos ateliers.";
}

function buildPlainQuantityPrice(summary: OfferScenarioSummary, total: number) {
  return `${summary.label} : PU HT ${fmtEUR(unitPriceFromTotal(summary, total))} / u - Total HT ${fmtEUR(total)}`;
}

function buildPlainTotalsRows(summaries: OfferScenarioSummary[], hasOptions: boolean) {
  const rows = [];
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
  transportIncluded: boolean;
}) {
  const { clientName, contactName, reference, objet, summaries, transportIncluded } = params;
  const greeting = contactName ? `Bonjour ${contactName},` : "Bonjour,";
  const mainDetails = collectDetails(summaries.map((summary) => summary.mainRows));
  const optionDetails = collectDetails(summaries.map((summary) => summary.optionRows));
  const hasOptions = summaries.some((summary) => summary.optionsTotalHT > 0);

  return [
    greeting,
    "",
    `Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée pour : ${objet}.`,
    clientName ? `Client : ${clientName}` : "",
    reference ? `Référence interne : ${reference}` : "",
    "",
    objet,
    ...buildPlainDetailLines(mainDetails),
    "",
    "Prix HT tout inclus :",
    ...summaries.map((summary) => buildPlainQuantityPrice(summary, summary.mainTotalHT)),
    hasOptions ? "" : "",
    hasOptions ? "Options :" : "",
    ...buildPlainDetailLines(optionDetails),
    hasOptions ? "Prix options HT :" : "",
    ...(hasOptions
      ? summaries.map((summary) => buildPlainQuantityPrice(summary, summary.optionsTotalHT))
      : []),
    "",
    ...buildPlainTotalsRows(summaries, hasOptions),
    "",
    "Conditions :",
    "Offre indicative valable 8 jours, sous réserve de validation technique et de disponibilité.",
    buildTransportCondition(transportIncluded),
    "Si cette proposition vous convient, nous vous transmettrons ensuite le devis officiel.",
    "",
    "Le Yeti vous remercie pour votre confiance.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHtmlMultiQuantityEmail(params: {
  clientName: string;
  contactName: string;
  clientEmail: string;
  reference: string;
  objet: string;
  summaries: OfferScenarioSummary[];
  transportIncluded: boolean;
}) {
  const { clientName, contactName, clientEmail, reference, objet, summaries, transportIncluded } =
    params;
  const greeting = contactName ? `Bonjour ${escapeHtml(contactName)},` : "Bonjour,";
  const mainDetails = collectDetails(summaries.map((summary) => summary.mainRows));
  const optionDetails = collectDetails(summaries.map((summary) => summary.optionRows));
  const hasOptions = summaries.some((summary) => summary.optionsTotalHT > 0);
  const textColWidth = 460;
  const quantityColWidth =
    summaries.length === 1
      ? 120
      : Math.max(
          110,
          Math.min(150, Math.floor((920 - textColWidth - 20) / Math.max(1, summaries.length)) - 20),
        );
  const tableWidth = textColWidth + 20 + summaries.length * (quantityColWidth + 20);

  const detailHtml = (details: string[] | undefined) =>
    details?.length
      ? `<div style="margin-top:6px;padding-top:5px;border-top:1px solid ${MAIL_BORDER};color:${MAIL_MUTED};font-size:11px;line-height:1.35;max-width:${textColWidth - 30}px;">
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
        <table cellpadding="0" cellspacing="0" width="${tableWidth}" style="width:${tableWidth}px;border-collapse:collapse;border:1px solid ${MAIL_BORDER};font-family:${FONT};">
          <thead>
            <tr>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:left;font-size:11px;text-transform:uppercase;width:${textColWidth}px;">Désignation</th>
              ${summaries
                .map(
                  (summary) =>
                    `<th style="padding:7px 10px;background:${MAIL_SOFT};color:${YETI_ORANGE};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:${quantityColWidth}px;">${escapeHtml(summary.label)}</th>`,
                )
                .join("")}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};color:${MAIL_TEXT};font-size:12px;width:${textColWidth}px;max-width:${textColWidth}px;">
                <div style="font-weight:700;white-space:normal;overflow-wrap:break-word;word-break:normal;">${escapeHtml(totalLabel)}</div>
                ${detailHtml(details)}
              </td>
              ${summaries
                .map((summary) => {
                  const total = totalForSummary(summary);
                  return `<td style="padding:8px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;white-space:nowrap;width:${quantityColWidth}px;">
                    <div style="font-weight:800;font-size:14px;">${escapeHtml(fmtEUR(unitPriceFromTotal(summary, total)))} / u</div>
                    <div style="font-size:10.5px;color:${MAIL_MUTED};margin-top:2px;">Total HT ${escapeHtml(fmtEUR(total))}</div>
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
      <td style="padding:6px 10px;border-bottom:1px solid ${MAIL_BORDER};color:${MAIL_MUTED};font-size:12px;font-weight:700;width:${textColWidth}px;">${escapeHtml(label)}</td>
      ${summaries
        .map(
          (summary) =>
            `<td style="padding:6px 10px;border-bottom:1px solid ${MAIL_BORDER};text-align:right;color:${MAIL_TEXT};font-size:12px;font-weight:700;white-space:nowrap;width:${quantityColWidth}px;">${escapeHtml(fmtEUR(valueForSummary(summary)))}</td>`,
        )
        .join("")}
    </tr>`;

  return `
<div style="margin:0;padding:0;background:#ffffff;color:${MAIL_TEXT};font-family:${FONT};font-size:12.5px;line-height:1.4;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:${tableWidth}px;border-collapse:collapse;font-family:${FONT};">
    <tr>
      <td style="padding:0 0 12px 0;color:${MAIL_TEXT};">
        <p style="margin:0 0 8px 0;">${greeting}</p>
        <p style="margin:0;">Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée.</p>
      </td>
    </tr>
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
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Projet</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(objet || "-")}</td>
          </tr>
          <tr>
            <td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Date</td>
            <td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(formatDate())}</td>
          </tr>
          ${
            reference
              ? `<tr><td style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_MUTED};font-size:11px;font-weight:700;">Référence</td><td style="padding:7px 10px;background:#ffffff;color:${MAIL_TEXT};font-size:12px;">${escapeHtml(reference)}</td></tr>`
              : ""
          }
        </table>
      </td>
    </tr>
    ${priceTable(objet || "Offre principale", mainDetails, "Prix HT tout inclus", (summary) => summary.mainTotalHT)}
    ${
      hasOptions
        ? priceTable(
            "Options",
            optionDetails,
            "Prix options HT",
            (summary) => summary.optionsTotalHT,
          )
        : ""
    }
    <tr>
      <td style="padding:0 0 16px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="${tableWidth}" style="width:${tableWidth}px;border-collapse:collapse;border:1px solid ${MAIL_BORDER};font-family:${FONT};">
          <thead>
            <tr>
              <th style="padding:7px 10px;background:${MAIL_SOFT};color:${MAIL_TEXT};border-bottom:1px solid ${MAIL_BORDER};text-align:left;font-size:11px;text-transform:uppercase;width:${textColWidth}px;">Total</th>
              ${summaries
                .map(
                  (summary) =>
                    `<th style="padding:7px 10px;background:${MAIL_SOFT};color:${YETI_ORANGE};border-bottom:1px solid ${MAIL_BORDER};text-align:right;font-size:11px;text-transform:uppercase;width:${quantityColWidth}px;">${escapeHtml(summary.label)}</th>`,
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
              <td style="padding:9px 10px;border-top:2px solid ${YETI_ORANGE};color:${MAIL_TEXT};font-size:12px;font-weight:700;width:${textColWidth}px;">Total TTC</td>
              ${summaries
                .map(
                  (summary) =>
                    `<td style="padding:9px 10px;border-top:2px solid ${YETI_ORANGE};text-align:right;color:${YETI_ORANGE};font-size:14px;font-weight:800;white-space:nowrap;width:${quantityColWidth}px;">${escapeHtml(fmtEUR(summary.totalTTC))}</td>`,
                )
                .join("")}
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:10px 12px;border:1px solid ${MAIL_BORDER};border-left:3px solid ${YETI_ORANGE};background:#fffaf6;color:${MAIL_TEXT};font-size:12px;">
        <p style="margin:0 0 6px 0;color:${YETI_ORANGE};font-weight:700;">Conditions</p>
        <p style="margin:0 0 5px 0;">Offre indicative valable 8 jours, sous réserve de validation technique et de disponibilité.</p>
        <p style="margin:0 0 5px 0;">${escapeHtml(buildTransportCondition(transportIncluded))}</p>
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

export function OfferEmailDialog({ dossier, meta, payload, output }: OfferEmailDialogProps) {
  const scenarioItems: ScenarioItem[] = (output?.scenarios ?? [])
    .map((scenario: any, index: number) => ({ scenario, index }))
    .filter((item: ScenarioItem) => Number(item.scenario.quantite) > 0);
  const isStandOffer = dossier?.type === "stands";
  const [scenarioIndex, setScenarioIndex] = useState("0");
  const selectedIndex = Math.min(Number(scenarioIndex) || 0, Math.max(0, scenarioItems.length - 1));
  const selectedItem = scenarioItems[selectedIndex];
  const scenario = selectedItem?.scenario;

  const offer = useMemo(() => {
    if (scenarioItems.length === 0) return null;

    const clientName = cleanLabel(dossier?.clients?.entreprise, "");
    const contactName = buildOfferContactName(dossier);
    const clientEmail = cleanLabel(dossier?.email || dossier?.clients?.email, "");
    const reference = cleanLabel(meta.reference, "");
    const objet = cleanLabel(meta.objet, dossier?.objet || "Offre de prix");
    const subject = `Offre de prix - ${clientName || "Client"} - ${objet}`;

    if (dossier?.type !== "stands") {
      const summaries = scenarioItems.map((item) =>
        buildScenarioSummary(dossier?.type, payload, output, item, "Base"),
      );
      const transportIncluded =
        payload?.transportPackaging?.transportInclus === true ||
        scenarioItems.some((item) => {
          const transportGlobal = Number(item.scenario.transportPackagingGlobal) || 0;
          const transportUnit = Number(item.scenario.transportPackagingUnit) || 0;
          return Math.abs(transportGlobal) > 0.005 || Math.abs(transportUnit) > 0.005;
        });
      const plainText = buildPlainTextMultiQuantityEmail({
        clientName,
        contactName,
        reference,
        objet,
        summaries,
        transportIncluded,
      });
      const html = buildHtmlMultiQuantityEmail({
        clientName,
        contactName,
        clientEmail,
        reference,
        objet,
        summaries,
        transportIncluded,
      });

      return { subject, plainText, html };
    }

    if (!scenario || !selectedItem) return null;

    const rawRows = buildOfferRows(dossier?.type, payload, output, scenario, selectedItem.index);
    const rows = reconcileRows(rawRows, scenario);
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
    });
    const html = buildHtmlEmail({
      clientName,
      contactName,
      clientEmail,
      reference,
      objet,
      mainRows,
      optionRows,
      mainTotalHT,
      optionsTotalHT,
      totalHT,
      vat,
      totalTTC,
    });

    return { subject, plainText, html };
  }, [dossier, meta, output, payload, scenario, scenarioItems, selectedItem]);

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

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={scenarioItems.length === 0}>
          <Mail className="w-4 h-4 mr-1.5" />
          Générer offre mail
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Offre à coller dans le mail</DialogTitle>
          <DialogDescription>
            Le corps du mail est généré depuis le calcul. Copiez-le puis collez-le directement dans
            Outlook, Gmail ou votre client mail. Les compositions sont affichées sans fournisseur et
            sans prix de détail.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
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

            <div className="flex flex-col gap-2">
              <Button onClick={copyBody} disabled={!offer}>
                <Clipboard className="w-4 h-4 mr-1.5" />
                Copier le corps du mail
              </Button>
              <Button variant="outline" onClick={copySubject} disabled={!offer}>
                Copier l'objet
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Le collage riche garde la mise en forme quand le navigateur l'autorise. Sinon, le
              texte simple est copié automatiquement.
            </p>
          </div>

          <div className="rounded-md border bg-white p-4 shadow-inner overflow-x-auto">
            <div
              className="min-w-[920px]"
              dangerouslySetInnerHTML={{ __html: offer?.html ?? "" }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
