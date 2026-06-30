import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { QuantitesRow } from "@/components/calc/Common";
import type { StandsInput, StandsParams } from "@/lib/calculs/stands";

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
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <QuantitesRow quantites={value.quantites} onChange={(q) => onChange({ ...value, quantites: q })} />
      </Card>

      {value.sections.map((sec, si) => (
        <Card key={si} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <Input
              value={sec.libelle}
              className="max-w-xs font-medium"
              onChange={(e) => {
                const next = [...value.sections];
                next[si] = { ...sec, libelle: e.target.value };
                onChange({ ...value, sections: next });
              }}
            />
            <div className="flex gap-1">
              <Button
                size="sm" variant="ghost"
                onClick={() => {
                  const next = [...value.sections];
                  next[si] = { ...sec, lignes: [...sec.lignes, { libelle: "", prixUnitaire: 0 }] };
                  onChange({ ...value, sections: next });
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Ligne
              </Button>
              <Button
                size="sm" variant="ghost" className="text-destructive"
                onClick={() => onChange({ ...value, sections: value.sections.filter((_, i) => i !== si) })}
              >
                Supprimer section
              </Button>
            </div>
          </div>
          <div className="border rounded-md divide-y">
            {sec.lignes.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground text-center">Aucune ligne.</div>
            )}
            {sec.lignes.map((l, li) => (
              <div key={li} className="grid grid-cols-[1fr_140px_36px] gap-2 px-2 py-1.5 items-center">
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
                  type="number" step="0.01"
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
                <Button size="icon" variant="ghost" onClick={() => {
                  const next = [...value.sections];
                  next[si] = { ...sec, lignes: sec.lignes.filter((_, i) => i !== li) };
                  onChange({ ...value, sections: next });
                }}>
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Button
        variant="outline"
        onClick={() =>
          onChange({ ...value, sections: [...value.sections, { libelle: "Nouvelle section", lignes: [] }] })
        }
      >
        <Plus className="w-4 h-4 mr-1.5" /> Ajouter une section
      </Button>

      <Card className="p-4 grid grid-cols-2 gap-4">
        <div>
          <Label>Coefficient de marge (%)</Label>
          <Input type="number" step="0.01" value={value.params.coef_marge_pct}
            onChange={(e) => setParams({ coef_marge_pct: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Marge créa supplémentaire (%)</Label>
          <Input type="number" step="0.01" value={value.params.marge_crea_pct}
            onChange={(e) => setParams({ marge_crea_pct: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Frais fixes (%)</Label>
          <Input type="number" step="0.01" value={value.params.frais_fixes_pct}
            onChange={(e) => setParams({ frais_fixes_pct: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Comm. rapporteur (% du PV)</Label>
          <Input type="number" step="0.01" value={value.params.commission_rapporteur_pct}
            onChange={(e) => setParams({ commission_rapporteur_pct: Number(e.target.value) })} />
        </div>
      </Card>
    </div>
  );
}
