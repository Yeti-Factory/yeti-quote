import { Card } from "@/components/ui/card";
import { fmtEUR, fmtPct } from "@/lib/format";
import type { CalcOutput, QuantityResult } from "@/lib/calculs/types";
import { AlertTriangle } from "lucide-react";

const ROWS: {
  label: string;
  key: keyof QuantityResult;
  fmt?: (v: number) => string;
  emphasize?: boolean;
}[] = [
  { label: "Prix unitaire achat", key: "prixUnitaireAchat", fmt: fmtEUR },
  { label: "Prix vente net unitaire", key: "prixVenteNetUnit", fmt: fmtEUR },
  { label: "Achats total", key: "achatsTotal", fmt: fmtEUR },
  { label: "Frais fixes", key: "fraisFixes", fmt: fmtEUR },
  { label: "Comm. sourcing /u", key: "commissionSourcingUnit", fmt: fmtEUR },
  { label: "Comm. rapporteur /u", key: "commissionRapporteurUnit", fmt: fmtEUR },
  { label: "Comm. rapporteur total", key: "commissionRapporteurTotal", fmt: fmtEUR },
  { label: "Total prix unitaire", key: "totalPrixUnitaire", fmt: fmtEUR, emphasize: true },
  { label: "Total CA", key: "totalCA", fmt: fmtEUR, emphasize: true },
  { label: "Total dépenses", key: "totalDepenses", fmt: fmtEUR },
  { label: "Marge nette", key: "margeNet", fmt: fmtEUR, emphasize: true },
  { label: "% Marge", key: "margePct", fmt: fmtPct, emphasize: true },
];

export function ResultsPanel({ output }: { output: CalcOutput }) {
  const scenarios = output.scenarios.filter((s) => s.quantite > 0);
  if (scenarios.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Saisissez au moins une quantité pour voir les résultats.
      </Card>
    );
  }
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-xs uppercase text-muted-foreground">
                Indicateur
              </th>
              {scenarios.map((s, i) => (
                <th key={i} className="text-right px-3 py-2 font-medium">
                  Qté {s.quantite.toLocaleString("fr-FR")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key as string} className={`border-b ${r.emphasize ? "bg-primary/5" : ""}`}>
                <td className={`px-3 py-2 ${r.emphasize ? "font-semibold" : ""}`}>{r.label}</td>
                {scenarios.map((s, i) => {
                  const v = s[r.key] as number;
                  return (
                    <td
                      key={i}
                      className={`px-3 py-2 text-right tabular-nums ${
                        r.emphasize ? "font-semibold" : ""
                      } ${r.key === "margePct" && s.alerteMarge ? "text-destructive" : ""}`}
                    >
                      {r.fmt ? r.fmt(v) : v}
                    </td>
                  );
                })}
              </tr>
            ))}
            {scenarios.some((s) => s.margeContra !== undefined) && (
              <>
                <tr className="border-b">
                  <td
                    className="px-3 py-2 text-xs uppercase text-muted-foreground"
                    colSpan={scenarios.length + 1}
                  >
                    Détail Contra
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2">Marge Contra</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {fmtEUR(s.margeContra!)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2">% Marge Contra</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {fmtPct(s.margeContraPct!)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2">Marge Autres fournisseurs</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {fmtEUR(s.margeAutres!)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2">% Marge Autres</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {fmtPct(s.margeAutresPct!)}
                    </td>
                  ))}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {scenarios.some((s) => s.alerteMarge) && (
        <div className="px-4 py-2.5 bg-destructive/10 text-destructive text-sm flex items-center gap-2 border-t">
          <AlertTriangle className="w-4 h-4" />
          Attention : marge insuffisante sur au moins un scénario.
        </div>
      )}
    </Card>
  );
}
