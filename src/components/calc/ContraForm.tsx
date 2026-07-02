import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { LinesTable, LinesGridTable, QuantitesRow } from "@/components/calc/Common";
import { SectionHeader } from "@/components/calc/SectionHeader";
import { Layers, ShoppingCart, Package, Truck, Settings2 } from "lucide-react";
import type { ContraInput, ContraParams } from "@/lib/calculs/contra";
import type { Quantite } from "@/lib/calculs/types";
import { syncLinesWithQuantites } from "@/lib/calculs/quantitySync";

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
  function handleQuantitesChange(newQ: Quantite[]) {
    onChange({
      ...value,
      quantites: newQ,
      achatsContra: syncLinesWithQuantites(value.quantites, newQ, value.achatsContra),
      achatsAutres: syncLinesWithQuantites(value.quantites, newQ, value.achatsAutres),
    });
  }
  return (
    <div className="space-y-5">
      <Card className="p-4 calc-section emphasis">
        <SectionHeader title="Quantités" tone="orange" icon={<Layers className="w-3.5 h-3.5" />} />
        <QuantitesRow
          quantites={value.quantites}
          onChange={handleQuantitesChange}
          defaultMargePct={value.params.coef_contra_pct}
        />
      </Card>

      <Card className="p-4 calc-section space-y-5">
        <div>
          <SectionHeader
            title="Achats chez Contra"
            subtitle="grille de prix par quantité"
            tone="dark"
            icon={<ShoppingCart className="w-3.5 h-3.5" />}
          />
          <LinesGridTable
            title="Lignes"
            lines={value.achatsContra}
            onChange={(l) => onChange({ ...value, achatsContra: l })}
            quantites={value.quantites}
            defaultMargePct={value.params.coef_contra_pct}
          />
        </div>
        <div>
          <SectionHeader
            title="Forfaits Contra"
            subtitle="divisés par la quantité"
            tone="muted"
            icon={<Package className="w-3.5 h-3.5" />}
          />
          <LinesTable
            title="Lignes"
            lines={value.forfaitsContra}
            onChange={(l) => onChange({ ...value, forfaitsContra: l })}
            field="montantGlobal"
            defaultMargePct={value.params.coef_contra_pct}
          />
        </div>
        <div>
          <SectionHeader
            title="Achats autres fournisseurs"
            subtitle="grille de prix par quantité"
            tone="accent"
            icon={<Truck className="w-3.5 h-3.5" />}
          />
          <LinesGridTable
            title="Lignes"
            lines={value.achatsAutres}
            onChange={(l) => onChange({ ...value, achatsAutres: l })}
            quantites={value.quantites}
            defaultMargePct={value.params.coef_autres_pct}
          />
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
            <Label>Coef. Contra (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.coef_contra_pct}
              onChange={(e) => setParams({ coef_contra_pct: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Coef. Autres (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.coef_autres_pct}
              onChange={(e) => setParams({ coef_autres_pct: Number(e.target.value) })}
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
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <div>
              <div className="text-sm font-medium">Commission sourcing</div>
              <div className="text-xs text-muted-foreground">5 % achats autres, mini 200 €</div>
            </div>
            <Switch
              checked={value.params.commission_sourcing}
              onCheckedChange={(b) => setParams({ commission_sourcing: b })}
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
        </div>
      </Card>
    </div>
  );
}
