import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
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
import { fmtEUR } from "@/lib/format";
import { buildSageQuoteRows, saveSageQuoteCsv } from "@/lib/sage-export";

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
    const result = await saveSageQuoteCsv({
      dossier,
      meta,
      payload,
      output,
      scenarioIndex: selectedIndex,
    });
    if (result === "saved") toast.success("CSV Sage enregistré");
    else if (result === "downloaded") toast.success("CSV Sage téléchargé");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="w-4 h-4 mr-1.5" />
          Export Sage CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exporter pour import Sage</DialogTitle>
          <DialogDescription>
            Première version CSV pour l'import paramétrable Sage. Les lignes sont construites depuis
            les éléments et groupes du dossier Yeti Quote.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
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

          <div className="flex justify-end">
            <Button onClick={exportCsv} disabled={rows.length === 0}>
              Télécharger le CSV Sage
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
