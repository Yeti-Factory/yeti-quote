import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { LinesTable, QuantitesRow } from "@/components/calc/Common";
import type { StandardInput, StandardParams } from "@/lib/calculs/standard";

export function StandardForm({
  value,
  onChange,
}: {
  value: StandardInput;
  onChange: (v: StandardInput) => void;
}) {
  function setParams(p: Partial<StandardParams>) {
    onChange({ ...value, params: { ...value.params, ...p } });
  }
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <QuantitesRow
          quantites={value.quantites}
          onChange={(q) => onChange({ ...value, quantites: q })}
          defaultMargePct={value.params.coef_marge_pct}
        />
      </Card>
      <Card className="p-4 space-y-4">
        <LinesTable
          title="Achats principaux (prix unitaire)"
          lines={value.achatsPrincipaux}
          onChange={(l) => onChange({ ...value, achatsPrincipaux: l })}
          field="prixUnitaire"
          defaultMargePct={value.params.coef_marge_pct}
        />
        <LinesTable
          title="Achats annexes (forfait global, divisé par la quantité)"
          lines={value.achatsAnnexes}
          onChange={(l) => onChange({ ...value, achatsAnnexes: l })}
          field="montantGlobal"
          defaultMargePct={value.params.coef_marge_pct}
        />
      </Card>
      <Card className="p-4 grid grid-cols-2 gap-4">
        <div>
          <Label>Coefficient de marge (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={value.params.coef_marge_pct}
            onChange={(e) => setParams({ coef_marge_pct: Number(e.target.value) })}
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
        <div className="flex items-center justify-between border rounded-md px-3 py-2">
          <div>
            <div className="text-sm font-medium">Commission sourcing</div>
            <div className="text-xs text-muted-foreground">5 % achats, mini 200 €</div>
          </div>
          <Switch
            checked={value.params.commission_sourcing}
            onCheckedChange={(b) => setParams({ commission_sourcing: b })}
          />
        </div>
        <div>
          <Label>Commission rapporteur (% du PV)</Label>
          <Input
            type="number"
            step="0.01"
            value={value.params.commission_rapporteur_pct}
            onChange={(e) => setParams({ commission_rapporteur_pct: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Comm. sourcing (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={value.params.commission_sourcing_pct}
            onChange={(e) => setParams({ commission_sourcing_pct: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Minimum comm. sourcing (€)</Label>
          <Input
            type="number"
            step="0.01"
            value={value.params.commission_sourcing_min_eur}
            onChange={(e) => setParams({ commission_sourcing_min_eur: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Seuil alerte marge (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={value.params.seuil_alerte_marge_pct}
            onChange={(e) => setParams({ seuil_alerte_marge_pct: Number(e.target.value) })}
          />
        </div>
      </Card>
    </div>
  );
}
