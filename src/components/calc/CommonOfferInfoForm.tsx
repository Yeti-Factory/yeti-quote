import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type OfferCommonInfo = {
  title: string;
  text: string;
};

type CommonOfferInfoFormProps = {
  value: OfferCommonInfo | null | undefined;
  onChange: (value: OfferCommonInfo) => void;
};

function normalizeCommonInfo(value: OfferCommonInfo | null | undefined): OfferCommonInfo {
  return {
    title: String(value?.title ?? ""),
    text: String(value?.text ?? ""),
  };
}

export function CommonOfferInfoForm({ value, onChange }: CommonOfferInfoFormProps) {
  const info = normalizeCommonInfo(value);
  const update = (patch: Partial<OfferCommonInfo>) => onChange({ ...info, ...patch });

  return (
    <Card className="p-4 space-y-4 border-primary/30">
      <div className="space-y-1">
        <h3 className="font-semibold">Informations communes à l’offre</h3>
        <p className="text-xs text-muted-foreground">
          Ce bloc apparaît une seule fois au début de l’offre générée, avant le détail des articles.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="offer-common-title">Titre</Label>
        <Input
          id="offer-common-title"
          value={info.title}
          onChange={(event) => update({ title: event.target.value })}
          placeholder="Ex. Informations communes à toutes les versions"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="offer-common-text">Texte commun</Label>
        <Textarea
          autoResize
          id="offer-common-text"
          rows={5}
          value={info.text}
          onChange={(event) => update({ text: event.target.value })}
          placeholder="Saisissez ici les caractéristiques, finitions, conditions ou précisions communes à tous les articles…"
        />
      </div>
    </Card>
  );
}
