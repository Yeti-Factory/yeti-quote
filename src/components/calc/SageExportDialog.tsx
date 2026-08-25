import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
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
import { fmtEUR } from "@/lib/format";
import {
  buildSageQuoteRows,
  downloadSageQuoteDiagnosticCsvs,
  getDefaultSageArticleCode,
  getDefaultSagePieceType,
  getSageClientCode,
  saveSageQuoteCsv,
} from "@/lib/sage-export";

type SageExportDialogProps = {
  dossier: any;
  meta: {
    reference: string;
    objet: string;
  };
  payload: any;
  output: any;
};

export function SageExportDialog({ dossier, meta, payload, output }: SageExportDialogProps) {
  const scenarioItems = useMemo(
    () =>
      (output?.scenarios ?? [])
        .map((scenario: any, index: number) => ({ scenario, index }))
        .filter((item: any) => Number(item.scenario?.quantite) > 0),
    [output],
  );
  const [scenarioIndex, setScenarioIndex] = useState(() => String(scenarioItems[0]?.index ?? 0));
  const [sageClientCode, setSageClientCode] = useState(() => getSageClientCode(dossier));
  const [defaultArticleCode, setDefaultArticleCode] = useState(() =>
    getDefaultSageArticleCode(dossier),
  );
  const [pieceType, setPieceType] = useState(() => getDefaultSagePieceType());
  const [includeHeader, setIncludeHeader] = useState(true);
  const selectedIndex = Number(scenarioIndex) || 0;
  const rows = useMemo(
    () =>
      buildSageQuoteRows({
        dossier,
        meta,
        payload,
        output,
        scenarioIndex: selectedIndex,
      }),
    [dossier, meta, output, payload, selectedIndex],
  );
  const totalHT = rows.reduce((sum, row) => sum + row.montantHT, 0);

  async function exportCsv() {
    if (rows.length === 0) {
      toast.error("Aucune ligne Sage à exporter.");
      return;
    }
    if (!sageClientCode.trim()) {
      toast.error("Renseignez le code client Sage.");
      return;
    }
    if (!defaultArticleCode.trim()) {
      toast.error("Renseignez le code article Sage.");
      return;
    }
    if (!pieceType.trim()) {
      toast.error("Renseignez le type de pièce Sage.");
      return;
    }
    const result = await saveSageQuoteCsv({
      dossier,
      meta,
      payload,
      output,
      scenarioIndex: selectedIndex,
      options: {
        sageClientCode,
        defaultArticleCode,
        pieceType,
        includeHeader,
      },
    });
    if (result === "saved") toast.success("CSV Sage enregistré");
    else if (result === "downloaded") toast.success("CSV Sage téléchargé");
  }

  function exportDiagnosticPack() {
    if (rows.length === 0) {
      toast.error("Aucune ligne Sage à exporter.");
      return;
    }
    if (!sageClientCode.trim() || !defaultArticleCode.trim() || !pieceType.trim()) {
      toast.error("Renseignez le type de pièce, le code client et le code article Sage.");
      return;
    }
    downloadSageQuoteDiagnosticCsvs({
      dossier,
      meta,
      payload,
      output,
      scenarioIndex: selectedIndex,
      options: {
        sageClientCode,
        defaultArticleCode,
        pieceType,
        includeHeader,
      },
    });
    toast.success("Pack test Sage téléchargé : essayez les fichiers dans l'ordre 01, 02, 03...");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="w-4 h-4 mr-1.5" />
          Export Sage CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>Exporter pour import Sage</DialogTitle>
          <DialogDescription>
            Première version CSV pour l'import paramétrable Sage. Les lignes sont construites depuis
            les éléments et groupes du dossier Yeti Quote.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4">
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-foreground/80">
            Sage attend une ligne <strong>E</strong> pour l'en-tête du devis et des lignes{" "}
            <strong>L</strong> pour le détail. Le code client et le code article doivent déjà
            exister dans Sage. En cas de rejet, utilisez le pack test : il génère plusieurs
            variantes pour identifier le format accepté par votre import Sage.
          </div>

          <div className="flex items-start gap-3 rounded-md border px-3 py-2">
            <Checkbox
              id="sage-include-header"
              checked={includeHeader}
              onCheckedChange={(checked) => setIncludeHeader(checked === true)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="sage-include-header">Inclure la ligne de titre</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                À laisser coché si Sage est paramétré pour ignorer la première ligne du fichier.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Si le rapport Sage parle de la ligne 2, cela peut viser l'en-tête <strong>E</strong>{" "}
                quand cette case est cochée, ou la première ligne <strong>L</strong> quand elle est
                décochée.
              </p>
            </div>
          </div>

          <div>
            <Label>Type de pièce Sage *</Label>
            <Input
              value={pieceType}
              onChange={(event) => setPieceType(event.target.value)}
              placeholder="Ex. Devis, D, DE, DV..."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Champ libre : renseignez exactement la valeur attendue par votre format d'import Sage.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Code client Sage *</Label>
              <Input
                value={sageClientCode}
                onChange={(event) => setSageClientCode(event.target.value)}
                placeholder="Ex. 154 ou CL0006"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Utilisez le code exact de la fiche client Sage Gestion commerciale, sans préfixe,
                suffixe ou espace ajouté.
              </p>
            </div>
            <div>
              <Label>Code article Sage pour toutes les lignes *</Label>
              <Input
                value={defaultArticleCode}
                onChange={(event) => setDefaultArticleCode(event.target.value)}
                placeholder="ARTDIVERS"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Chaque ligne exportée utilisera ce code. La valeur par défaut est ARTDIVERS.
              </p>
            </div>
          </div>

          {scenarioItems.length > 1 && (
            <div className="max-w-xs">
              <Label>Quantité à exporter</Label>
              <Select value={scenarioIndex} onValueChange={setScenarioIndex}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une quantité" />
                </SelectTrigger>
                <SelectContent>
                  {scenarioItems.map((item: any) => (
                    <SelectItem key={item.index} value={String(item.index)}>
                      Qté {Number(item.scenario.quantite).toLocaleString("fr-FR")} -{" "}
                      {fmtEUR(Number(item.scenario.totalCA) || 0)} HT
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="bg-muted text-primary">
                  <th className="text-left px-3 py-2 font-bold uppercase text-[11px]">
                    Désignation
                  </th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[11px]">Qté</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[11px]">PU HT</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[11px]">
                    Montant HT
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.numeroLigne} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.designation}</div>
                      {row.description && (
                        <div className="text-xs text-muted-foreground mt-1">{row.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.quantite.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtEUR(row.prixUnitaireHT)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {fmtEUR(row.montantHT)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                      Aucune ligne à exporter.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/50">
                    <td className="px-3 py-2 font-bold" colSpan={3}>
                      Total HT exporté
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {fmtEUR(totalHT)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="border-t bg-background px-6 py-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={exportDiagnosticPack} disabled={rows.length === 0}>
            Exporter pack test Sage
          </Button>
          <Button onClick={exportCsv} disabled={rows.length === 0}>
            Télécharger le CSV Sage
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
