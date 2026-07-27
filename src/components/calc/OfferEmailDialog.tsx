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
import { getPrixAchat, resolveMargePct } from "@/lib/calculs/types";
import { fmtEUR } from "@/lib/format";

type OfferRow = {
  designation: string;
  quantity: number;
  unitPrice: number;
  details?: string[];
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

function buildLineDetail(line: any, fallback: string) {
  return cleanLabel(line?.libelle, fallback)
    .replace(/\s+composants?$/i, "")
    .trim();
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

function pvFromResidual(cost: number, margePct: number): number {
  const m = Math.max(0, Math.min(99, Number(margePct) || 0));
  return cost / (1 - m / 100);
}

function addRow(
  rows: OfferRow[],
  designation: string,
  quantity: number,
  unitPrice: number,
  details: string[] = [],
) {
  if (!Number.isFinite(unitPrice) || Math.abs(unitPrice) < 0.005) return;
  rows.push({
    designation: cleanLabel(designation, "Prestation"),
    quantity,
    unitPrice,
    details: cleanDetails(details),
  });
}

function buildStandardRows(payload: any, scenario: any, scenarioIndex: number): OfferRow[] {
  const rows: OfferRow[] = [];
  const quantite = Number(scenario.quantite) || 0;
  const quantiteMarge = payload?.quantites?.[scenarioIndex]?.margePct ?? null;
  const defaultMarge = Number(payload?.params?.coef_marge_pct) || 0;

  let achatsPrincipauxUnit = 0;
  const achatsPrincipauxDetails: string[] = [];
  for (const [index, line] of (payload?.achatsPrincipaux ?? []).entries()) {
    const achat = getPrixAchat(line, scenarioIndex);
    const marge = resolveMargePct(line?.margePct, quantiteMarge, defaultMarge);
    achatsPrincipauxUnit += achat * (1 + marge / 100);
    achatsPrincipauxDetails.push(buildLineDetail(line, `Prestation ${index + 1}`));
  }
  addRow(rows, "Achats principaux", quantite, achatsPrincipauxUnit, achatsPrincipauxDetails);

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

function buildContraRows(payload: any, scenario: any, scenarioIndex: number): OfferRow[] {
  const rows: OfferRow[] = [];
  const quantite = Number(scenario.quantite) || 0;
  const quantiteMarge = payload?.quantites?.[scenarioIndex]?.margePct ?? null;
  const coefContra = Number(payload?.params?.coef_contra_pct) || 0;
  const contraFactor = 1 + coefContra / 100;

  let achatsContraUnit = 0;
  const achatsContraDetails: string[] = [];
  for (const [index, line] of (payload?.achatsContra ?? []).entries()) {
    const raw = getPrixAchat(line, scenarioIndex);
    const cost = raw * contraFactor;
    const margeYeti = resolveMargePct(line?.margePct, quantiteMarge, coefContra);
    achatsContraUnit += pvFromResidual(cost, margeYeti);
    achatsContraDetails.push(buildLineDetail(line, `Prestation Contra ${index + 1}`));
  }
  addRow(rows, "Achats chez Contra", quantite, achatsContraUnit, achatsContraDetails);

  let forfaitsContraUnit = 0;
  const forfaitsContraDetails: string[] = [];
  for (const [index, line] of (payload?.forfaitsContra ?? []).entries()) {
    const share = quantite > 0 ? (Number(line?.montantGlobal) || 0) / quantite : 0;
    const cost = share * contraFactor;
    const margeYeti = resolveMargePct(line?.margePct, quantiteMarge, coefContra);
    forfaitsContraUnit += pvFromResidual(cost, margeYeti);
    forfaitsContraDetails.push(buildLineDetail(line, `Forfait Contra ${index + 1}`));
  }
  addRow(rows, "Forfaits Contra", quantite, forfaitsContraUnit, forfaitsContraDetails);

  const tpUnit = Number(scenario.transportPackagingUnit) || 0;
  const costTP = tpUnit * contraFactor;
  const hasTpMargin = scenario.transportPackagingSansMarge === false;
  const tpMarge = Number(scenario.transportPackagingMargePct) || 0;
  addRow(
    rows,
    "Transport / Packaging",
    quantite,
    hasTpMargin ? pvFromResidual(costTP, tpMarge) : costTP,
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
) {
  if (type === "standard") return buildStandardRows(payload, scenario, scenarioIndex);
  if (type === "contra") return buildContraRows(payload, scenario, scenarioIndex);
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

function buildPlainTextEmail(params: {
  subject: string;
  clientName: string;
  contactName: string;
  reference: string;
  objet: string;
  rows: OfferRow[];
  totalHT: number;
  vat: number;
  totalTTC: number;
}) {
  const { clientName, contactName, reference, objet, rows, totalHT, vat, totalTTC } = params;
  const greeting = contactName ? `Bonjour ${contactName},` : "Bonjour,";

  return [
    greeting,
    "",
    `Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée pour : ${objet}.`,
    clientName ? `Client : ${clientName}` : "",
    reference ? `Référence interne : ${reference}` : "",
    "",
    "Détail de l'offre :",
    ...rows.flatMap((row) => [
      `- ${row.designation} - qté ${row.quantity.toLocaleString("fr-FR")} - PU HT ${fmtEUR(row.unitPrice)} - Total HT ${fmtEUR(row.unitPrice * row.quantity)}`,
      ...(row.details?.length ? row.details.map((detail) => `  - ${detail}`) : []),
    ]),
    "",
    `Total HT : ${fmtEUR(totalHT)}`,
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
  rows: OfferRow[];
  totalHT: number;
  vat: number;
  totalTTC: number;
}) {
  const { clientName, contactName, clientEmail, reference, objet, rows, totalHT, vat, totalTTC } =
    params;
  const greeting = contactName ? `Bonjour ${escapeHtml(contactName)},` : "Bonjour,";
  const detailHtml = (details: string[] | undefined) =>
    details?.length
      ? `<div style="margin-top:7px;padding-top:6px;border-top:1px solid #f0ebe5;color:#51463f;font-size:12px;line-height:1.35;">
          ${details
            .map((detail) => `<div style="margin:2px 0;">&bull;&nbsp;${escapeHtml(detail)}</div>`)
            .join("")}
        </div>`
      : "";
  const rowHtml = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e7e0d8;color:#111111;">
            <div style="font-weight:700;">${escapeHtml(row.designation)}</div>
            ${detailHtml(row.details)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e7e0d8;text-align:right;color:#111111;">${escapeHtml(row.quantity.toLocaleString("fr-FR"))}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e7e0d8;text-align:right;color:#111111;white-space:nowrap;">${escapeHtml(fmtEUR(row.unitPrice))}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e7e0d8;text-align:right;color:#111111;white-space:nowrap;font-weight:700;">${escapeHtml(fmtEUR(row.unitPrice * row.quantity))}</td>
        </tr>`,
    )
    .join("");

  return `
<div style="margin:0;padding:0;background:#ffffff;color:#111111;font-family:${FONT};font-size:14px;line-height:1.45;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:760px;border-collapse:collapse;font-family:${FONT};">
    <tr>
      <td style="padding:0 0 14px 0;color:#111111;">
        <p style="margin:0 0 10px 0;">${greeting}</p>
        <p style="margin:0;">Suite à votre demande, vous trouverez ci-dessous notre offre de prix simplifiée.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 0 16px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e3d8cf;">
          <tr>
            <td style="padding:10px 12px;background:#111111;color:#ffffff;font-weight:700;width:155px;">Client</td>
            <td style="padding:10px 12px;background:#fbf8f4;color:#111111;">${escapeHtml(clientName || "-")}</td>
          </tr>
          ${
            clientEmail
              ? `<tr><td style="padding:10px 12px;background:#111111;color:#ffffff;font-weight:700;">Email</td><td style="padding:10px 12px;background:#ffffff;color:#111111;">${escapeHtml(clientEmail)}</td></tr>`
              : ""
          }
          <tr>
            <td style="padding:10px 12px;background:#111111;color:#ffffff;font-weight:700;">Projet</td>
            <td style="padding:10px 12px;background:#ffffff;color:#111111;">${escapeHtml(objet || "-")}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;background:#111111;color:#ffffff;font-weight:700;">Date</td>
            <td style="padding:10px 12px;background:#fbf8f4;color:#111111;">${escapeHtml(formatDate())}</td>
          </tr>
          ${
            reference
              ? `<tr><td style="padding:10px 12px;background:#111111;color:#ffffff;font-weight:700;">Référence</td><td style="padding:10px 12px;background:#ffffff;color:#111111;">${escapeHtml(reference)}</td></tr>`
              : ""
          }
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 0 16px 0;">
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:2px solid #111111;font-family:${FONT};">
          <thead>
            <tr>
              <th style="padding:10px 12px;background:#111111;color:#ffffff;text-align:left;font-size:12px;text-transform:uppercase;">Désignation</th>
              <th style="padding:10px 12px;background:#111111;color:#ffffff;text-align:right;font-size:12px;text-transform:uppercase;width:70px;">Qté</th>
              <th style="padding:10px 12px;background:#111111;color:#ffffff;text-align:right;font-size:12px;text-transform:uppercase;width:120px;">PU HT</th>
              <th style="padding:10px 12px;background:#ff7900;color:#ffffff;text-align:right;font-size:12px;text-transform:uppercase;width:130px;">Total HT</th>
            </tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 0 18px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:${FONT};">
          <tr>
            <td style="padding:8px 12px;text-align:right;color:#111111;">Total HT</td>
            <td style="padding:8px 12px;text-align:right;color:#111111;width:160px;font-weight:700;">${escapeHtml(fmtEUR(totalHT))}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;text-align:right;color:#111111;">TVA 20 %</td>
            <td style="padding:8px 12px;text-align:right;color:#111111;font-weight:700;">${escapeHtml(fmtEUR(vat))}</td>
          </tr>
          <tr>
            <td style="padding:12px;text-align:right;background:#111111;color:#ffffff;font-weight:700;">Total TTC</td>
            <td style="padding:12px;text-align:right;background:#ff7900;color:#ffffff;font-weight:900;font-size:18px;">${escapeHtml(fmtEUR(totalTTC))}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 16px;border:1px solid #e3d8cf;background:#fbf8f4;color:#111111;">
        <p style="margin:0 0 8px 0;font-weight:700;">Conditions</p>
        <p style="margin:0 0 6px 0;">Offre indicative valable 8 jours, sous réserve de validation technique et de disponibilité.</p>
        <p style="margin:0 0 6px 0;">Si cette proposition vous convient, nous vous transmettrons ensuite le devis officiel.</p>
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
  const scenarios = (output?.scenarios ?? []).filter(
    (scenario: any) => Number(scenario.quantite) > 0,
  );
  const [scenarioIndex, setScenarioIndex] = useState("0");
  const selectedIndex = Math.min(Number(scenarioIndex) || 0, Math.max(0, scenarios.length - 1));
  const scenario = scenarios[selectedIndex];

  const offer = useMemo(() => {
    if (!scenario) return null;

    const clientName = cleanLabel(dossier?.clients?.entreprise, "");
    const contactName = cleanLabel(dossier?.contact || dossier?.clients?.contact, "");
    const clientEmail = cleanLabel(dossier?.email || dossier?.clients?.email, "");
    const reference = cleanLabel(meta.reference, "");
    const objet = cleanLabel(meta.objet, dossier?.objet || "Offre de prix");
    const rawRows = buildOfferRows(dossier?.type, payload, output, scenario, selectedIndex);
    const rows = reconcileRows(rawRows, scenario);
    const totalHT =
      Number(scenario.totalCA) || rows.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0);
    const vat = totalHT * 0.2;
    const totalTTC = totalHT + vat;
    const subject = `Offre de prix - ${clientName || "Client"} - ${objet}`;
    const plainText = buildPlainTextEmail({
      subject,
      clientName,
      contactName,
      reference,
      objet,
      rows,
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
      rows,
      totalHT,
      vat,
      totalTTC,
    });

    return { subject, plainText, html };
  }, [dossier, meta, output, payload, scenario, selectedIndex]);

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
        <Button variant="outline" disabled={scenarios.length === 0}>
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
            <div className="space-y-2">
              <Label>Quantité proposée</Label>
              <Select value={String(selectedIndex)} onValueChange={setScenarioIndex}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((item: any, index: number) => (
                    <SelectItem key={index} value={String(index)}>
                      Qté {Number(item.quantite).toLocaleString("fr-FR")} - {fmtEUR(item.totalCA)}{" "}
                      HT
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              className="min-w-[720px]"
              dangerouslySetInnerHTML={{ __html: offer?.html ?? "" }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
