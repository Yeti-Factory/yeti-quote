import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { LinesTable, QuantitesRow } from "@/components/calc/Common";
import type { ContraInput, ContraParams } from "@/lib/calculs/contra";

export function ContraForm({
  value,
  onChange,
}: {
  value: ContraInput;
  onChange: (v: ContraInput) => void;
}) {
  function setParams(p: Partial<ContraParams>) {
    onChange({ ...value, params: { ...value.params, ...p } });
  }
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <QuantitesRow quantites={value.quantites} onChange={(q) => onChange({ ...value, quantites: q })} />
      </Card>
      <Card className="p-4 space-y-4">
        <LinesTable
          title="Achats CHEZ CONTRA (prix unitaire)"
          lines={value.achatsContra}
          onChange={(l) => onChange({ ...value, achatsContra: l })}
          field="prixUnitaire"
        />
        <LinesTable
          title="Forfaits Contra (divisés par la quantité)"
          lines={value.forfaitsContra}
          onChange={(l) => onChange({ ...value, forfaitsContra: l })}
          field="montantGlobal"
        />
        <LinesTable
          title="Achats autres fournisseurs (prix unitaire)"
          lines={value.achatsAutres}
          onChange={(l) => onChange({ ...value, achatsAutres: l })}
          field="prixUnitaire"
        />
      </Card>
      <Card className="p-4 grid grid-cols-2 gap-4">
        <div>
          <Label>Coef. Contra (%)</Label>
          <Input type="number" step="0.01" value={value.params.coef_contra_pct}
            onChange={(e) => setParams({ coef_contra_pct: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Coef. Autres (%)</Label>
          <Input type="number" step="0.01" value={value.params.coef_autres_pct}
            onChange={(e) => setParams({ coef_autres_pct: Number(e.target.value) })} />
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
        <div className="flex items-center justify-between border rounded-md px-3 py-2">
          <div>
            <div className="text-sm font-medium">Commission sourcing</div>
            <div className="text-xs text-muted-foreground">5 % achats autres, mini 200 €</div>
          </div>
          <Switch checked={value.params.commission_sourcing}
            onCheckedChange={(b) => setParams({ commission_sourcing: b })} />
        </div>
        <div>
          <Label>Comm. sourcing (%)</Label>
          <Input type="number" step="0.01" value={value.params.commission_sourcing_pct}
            onChange={(e) => setParams({ commission_sourcing_pct: Number(e.target.value) })} />
        </div>
      </Card>
    </div>
  );
}
