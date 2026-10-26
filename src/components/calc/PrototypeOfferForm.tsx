import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type OfferPrototype = {
  enabled: boolean;
  priceHT: number;
  description: string;
  comment: string;
};

type PrototypeOfferFormProps = {
  value: OfferPrototype | null | undefined;
  onChange: (value: OfferPrototype) => void;
};

function normalizePrototype(value: OfferPrototype | null | undefined): OfferPrototype {
  return {
    enabled: value?.enabled === true,
    priceHT: Number(value?.priceHT) || 0,
    description: String(value?.description ?? ""),
    comment: String(value?.comment ?? ""),
  };
}

export function PrototypeOfferForm({ value, onChange }: PrototypeOfferFormProps) {
  const prototype = normalizePrototype(value);
  const update = (patch: Partial<OfferPrototype>) => onChange({ ...prototype, ...patch });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <Checkbox
          id="offer-prototype-enabled"
          checked={prototype.enabled}
          onCheckedChange={(checked) => update({ enabled: checked === true })}
        />
        <div className="space-y-1">
          <Label htmlFor="offer-prototype-enabled" className="cursor-pointer font-semibold">
            Ajouter le prix du prototype à l’offre
          </Label>
          <p className="text-xs text-muted-foreground">
            Ce montant sera présenté séparément à la fin de l’offre et ne modifiera pas les totaux
            de production.
          </p>
        </div>
      </div>

      {prototype.enabled && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="offer-prototype-price">Prix du prototype HT</Label>
            <Input
              id="offer-prototype-price"
              type="number"
              min="0"
              step="0.01"
              value={prototype.priceHT || ""}
              onChange={(event) => update({ priceHT: Number(event.target.value) || 0 })}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="offer-prototype-description">Descriptif du prototype</Label>
            <Textarea
              autoResize
              id="offer-prototype-description"
              rows={3}
              value={prototype.description}
              onChange={(event) => update({ description: event.target.value })}
              placeholder="Ex. Prototype à l’échelle 1, impression et finitions incluses…"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="offer-prototype-comment">Commentaire</Label>
            <Textarea
              autoResize
              id="offer-prototype-comment"
              rows={2}
              value={prototype.comment}
              onChange={(event) => update({ comment: event.target.value })}
              placeholder="Ex. Délai, conditions de validation ou précision commerciale…"
            />
          </div>
        </div>
      )}
    </Card>
  );
}
