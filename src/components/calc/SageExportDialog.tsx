import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { backend } from "@/integrations/native/client";

import { Button } from "@/components/ui/button";
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
  getDefaultSageArticleCode,
  getDefaultSageDepotCode,
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
  const [depotCode, setDepotCode] = useState(() => getDefaultSageDepotCode());
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
    try {
      if (sageClientCode.trim() !== getSageClientCode(dossier)) {
        const { error } = await backend
          .from("clients")
          .update({ code_sage: sageClientCode.trim() })
          .eq("id", dossier.client_id);
        if (error) throw error;
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
          depotCode,
        },
      });
      if (result === "saved") toast.success("Fichier Sage enregistré");
      else if (result === "downloaded") toast.success("Fichier Sage téléchargé");
    } catch (error: any) {
      toast.error(error?.message ?? "Export Sage impossible");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="w-4 h-4 mr-1.5" />
          Export Sage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>Exporter pour import Sage</DialogTitle>
          <DialogDescription>
            Fichier texte prêt pour « Import des pièces clients » dans Sage 50 / Ciel.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4">
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-foreground/80">
            Ce fichier reprend le format configuré dans votre Sage : une ligne <strong>E</strong>,
            puis les lignes <strong>L</strong>, séparées par des tabulations. Le dépôt reste vide et
            Sage attribue automatiquement le prochain numéro de devis.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Code client Sage *</Label>
              <Input
                value={sageClientCode}
                onChange={(event) => setSageClientCode(event.target.value)}
                placeholder="Ex. 057"
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
                placeholder="ART0097"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Chaque ligne utilisera ce code existant dans Sage. <strong>ART0097</strong> —
                Prestation de services — est utilisé par défaut.
              </p>
            </div>
            <div>
              <Label>Code dépôt Sage</Label>
              <Input
                value={depotCode}
                onChange={(event) => setDepotCode(event.target.value)}
                placeholder="Laisser vide"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Votre Sage n'utilise pas de liste de dépôts : laissez ce champ vide.
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
          <Button onClick={exportCsv} disabled={rows.length === 0}>
            Télécharger le fichier Sage 50
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
