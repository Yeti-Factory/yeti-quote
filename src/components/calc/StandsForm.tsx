import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Layers, LayoutGrid, Sigma, Settings2 } from "lucide-react";
import { QuantitesRow } from "@/components/calc/Common";
import { SectionHeader } from "@/components/calc/SectionHeader";
import { fmtEUR, fmtPct } from "@/lib/format";
import type { StandsInput, StandsParams } from "@/lib/calculs/stands";
import { calculerStands } from "@/lib/calculs/stands";

export function StandsForm({
  value,
  onChange,
}: {
  value: StandsInput;
  onChange: (v: StandsInput) => void;
}) {
  function setParams(p: Partial<StandsParams>) {
    onChange({ ...value, params: { ...value.params, ...p } });
  }

  const out = calculerStands(value);

  return (
    <div className="space-y-4">
      <Card className="p-4 calc-section emphasis">
        <SectionHeader
          title="Quantités"
          tone="orange"
          icon={<Layers className="w-3.5 h-3.5" />}
        />
        <QuantitesRow
          quantites={value.quantites}
          onChange={(q) => onChange({ ...value, quantites: q })}
          defaultMargePct={value.params.coef_marge_pct}
        />
      </Card>

      {value.sections.map((sec, si) => {
        const groupe = out.extra.groupes[si];
        return (
          <Card key={si} className="p-4 calc-section">
            <SectionHeader
              title={`Groupe ${si + 1}`}
              tone="dark"
              icon={<LayoutGrid className="w-3.5 h-3.5" />}
            />
            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_120px_140px_auto] gap-3 items-center mb-3">
              <Input
                value={sec.libelle}
                className="font-medium"
                onChange={(e) => {
                  const next = [...value.sections];
                  next[si] = { ...sec, libelle: e.target.value };
                  onChange({ ...value, sections: next });
                }}
              />
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Achat</div>
                <div className="font-medium tabular-nums">{fmtEUR(groupe?.achatTotal ?? 0)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Marge groupe %</div>
                <Input
                  type="number"
                  step="0.01"
                  className="h-8"
                  placeholder="Marge groupe %"
                  value={sec.margePct ?? value.params.coef_marge_pct ?? ""}
                  onChange={(e) => {
                    const next = [...value.sections];
                    next[si] = {
                      ...sec,
                      margePct: e.target.value === "" ? null : Number(e.target.value),
                    };
                    onChange({ ...value, sections: next });
                  }}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Prix vente</div>
                <div className="font-semibold tabular-nums">{fmtEUR(groupe?.pvTotal ?? 0)}</div>
              </div>
              <div className="flex gap-1 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const next = [...value.sections];
                    next[si] = {
                      ...sec,
                      lignes: [...sec.lignes, { fournisseur: "", libelle: "", prixUnitaire: 0 }],
                    };
                    onChange({ ...value, sections: next });
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Ligne
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    onChange({ ...value, sections: value.sections.filter((_, i) => i !== si) })
                  }
                >
                  Suppr.
                </Button>
              </div>
            </div>
            <div className="border rounded-md">
              <div className="grid grid-cols-[160px_1fr_140px_36px] gap-2 px-2 py-1.5 border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <div>Fournisseur</div>
                <div>Libellé</div>
                <div className="text-right">Prix achat</div>
                <div />
              </div>
              {sec.lignes.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                  Aucune ligne.
                </div>
              )}
              <div className="divide-y">
                {sec.lignes.map((l, li) => (
                  <div
                    key={li}
                    className="grid grid-cols-[160px_1fr_140px_36px] gap-2 px-2 py-1.5 items-center"
                  >
                    <Input
                      value={l.fournisseur ?? ""}
                      placeholder="Fournisseur"
                      maxLength={20}
                      onChange={(e) => {
                        const next = [...value.sections];
                        const lignes = [...sec.lignes];
                        lignes[li] = { ...l, fournisseur: e.target.value };
                        next[si] = { ...sec, lignes };
                        onChange({ ...value, sections: next });
                      }}
                    />
                    <Input
                      value={l.libelle}
                      placeholder="Libellé"
                      onChange={(e) => {
                        const next = [...value.sections];
                        const lignes = [...sec.lignes];
                        lignes[li] = { ...l, libelle: e.target.value };
                        next[si] = { ...sec, lignes };
                        onChange({ ...value, sections: next });
                      }}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={l.prixUnitaire || ""}
                      placeholder="Prix achat"
                      onChange={(e) => {
                        const next = [...value.sections];
                        const lignes = [...sec.lignes];
                        lignes[li] = { ...l, prixUnitaire: Number(e.target.value) || 0 };
                        next[si] = { ...sec, lignes };
                        onChange({ ...value, sections: next });
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        const next = [...value.sections];
                        next[si] = { ...sec, lignes: sec.lignes.filter((_, i) => i !== li) };
                        onChange({ ...value, sections: next });
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        );
      })}

      <Button
        variant="outline"
        onClick={() =>
          onChange({
            ...value,
            sections: [
              ...value.sections,
              { libelle: "Nouvelle section", lignes: [], margePct: value.params.coef_marge_pct },
            ],
          })
        }
      >
        <Plus className="w-4 h-4 mr-1.5" /> Ajouter une section
      </Button>

      <Card className="p-4 calc-section emphasis">
        <SectionHeader
          title="Totaux stand"
          tone="orange"
          icon={<Sigma className="w-3.5 h-3.5" />}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b-2">
              <tr>
                <th className="text-left px-3 py-2">Groupe</th>
                <th className="text-right px-3 py-2">Achat</th>
                <th className="text-right px-3 py-2">Marge</th>
                <th className="text-right px-3 py-2">Prix vente</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {out.extra.groupes.map((g, i) => (
                <tr key={i} className="hover:bg-accent/40">
                  <td className="px-3 py-2">{g.libelle}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEUR(g.achatTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtPct(g.margePct / 100)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtEUR(g.pvTotal)}
                  </td>
                </tr>
              ))}
              <tr className="bg-primary/10 font-semibold border-t-2 border-primary/40">
                <td className="px-3 py-2.5">Total stand</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtEUR(out.extra.totalAchatGroupes)}
                </td>
                <td />
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtEUR(out.extra.totalPvGroupes)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 calc-section">
        <SectionHeader
          title="Paramètres"
          tone="muted"
          icon={<Settings2 className="w-3.5 h-3.5" />}
        />
        <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Coefficient de marge par défaut (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={value.params.coef_marge_pct}
            onChange={(e) => setParams({ coef_marge_pct: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Marge créa supplémentaire (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={value.params.marge_crea_pct}
            onChange={(e) => setParams({ marge_crea_pct: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Frais fixes (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={value.params.frais_fixes_pct}
            onChange={(e) => setParams({ frais_fixes_pct: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Comm. rapporteur (% du PV)</Label>
          <Input
            type="number"
            step="0.01"
            value={value.params.commission_rapporteur_pct}
            onChange={(e) => setParams({ commission_rapporteur_pct: Number(e.target.value) })}
          />
        </div>
      </Card>
    </div>
  );
}
