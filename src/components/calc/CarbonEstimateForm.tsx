import { useState } from "react";
import { ChevronDown, ChevronUp, Leaf, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CARBON_MATERIALS,
  createCarbonArticle,
  createCarbonEstimate,
  createCarbonMaterial,
  normalizeCarbonEstimate,
  type CarbonArticle,
  type CarbonEstimate,
  type CarbonMaterialShare,
} from "@/lib/carbon";

function readOptionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function CarbonEstimateForm({
  value,
  onChange,
}: {
  value?: CarbonEstimate | null;
  onChange: (value: CarbonEstimate) => void;
}) {
  const estimate = normalizeCarbonEstimate(value ?? createCarbonEstimate());
  const [open, setOpen] = useState(estimate.enabled);

  function enable(enabled: boolean) {
    setOpen(enabled);
    onChange({
      ...estimate,
      enabled,
      articles:
        enabled && estimate.articles.length === 0 ? [createCarbonArticle()] : estimate.articles,
    });
  }

  function updateArticle(index: number, patch: Partial<CarbonArticle>) {
    onChange({
      ...estimate,
      articles: estimate.articles.map((article, articleIndex) =>
        articleIndex === index ? { ...article, ...patch } : article,
      ),
    });
  }

  function removeArticle(index: number) {
    onChange({
      ...estimate,
      articles: estimate.articles.filter((_, articleIndex) => articleIndex !== index),
    });
  }

  function addArticle() {
    setOpen(true);
    onChange({
      ...estimate,
      enabled: true,
      articles: [...estimate.articles, createCarbonArticle()],
    });
  }

  return (
    <Card className="calc-section overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Leaf className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Empreinte carbone</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Facultatif
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Poids et matières communiqués par le fournisseur.
              {estimate.enabled && estimate.articles.length > 0
                ? ` ${estimate.articles.length} article${estimate.articles.length > 1 ? "s" : ""}.`
                : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="carbon-enabled" className="text-xs">
            Renseigner
          </Label>
          <Switch id="carbon-enabled" checked={estimate.enabled} onCheckedChange={enable} />
          {estimate.enabled && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={open ? "Replier le formulaire carbone" : "Ouvrir le formulaire carbone"}
              onClick={() => setOpen((current) => !current)}
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {estimate.enabled && open && (
        <div className="space-y-4 border-t bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-xs text-muted-foreground">
              Saisissez le poids d’une pièce. Pour un article composé de plusieurs matières,
              répartissez simplement les pourcentages jusqu’à 100 %.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={addArticle}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un article
            </Button>
          </div>

          {estimate.articles.length === 0 ? (
            <button
              type="button"
              className="w-full rounded-md border border-dashed p-5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              onClick={addArticle}
            >
              <Plus className="mx-auto mb-1 h-4 w-4" />
              Ajouter le premier article
            </button>
          ) : (
            estimate.articles.map((article, articleIndex) => (
              <ArticleEditor
                key={article.id}
                article={article}
                index={articleIndex}
                onChange={(patch) => updateArticle(articleIndex, patch)}
                onRemove={() => removeArticle(articleIndex)}
              />
            ))
          )}
        </div>
      )}
    </Card>
  );
}

function ArticleEditor({
  article,
  index,
  onChange,
  onRemove,
}: {
  article: CarbonArticle;
  index: number;
  onChange: (patch: Partial<CarbonArticle>) => void;
  onRemove: () => void;
}) {
  function updateMaterial(materialIndex: number, patch: Partial<CarbonMaterialShare>) {
    onChange({
      materials: article.materials.map((material, index) =>
        index === materialIndex ? { ...material, ...patch } : material,
      ),
    });
  }

  function addMaterial() {
    onChange({
      materials: [
        ...article.materials,
        { ...createCarbonMaterial(), sharePct: article.materials.length === 0 ? 100 : 0 },
      ],
    });
  }

  function removeMaterial(materialIndex: number) {
    onChange({
      materials: article.materials.filter((_, index) => index !== materialIndex),
    });
  }

  const shareTotal = article.materials.reduce(
    (total, material) => total + (Number(material.sharePct) || 0),
    0,
  );
  const compositionComplete = article.materials.length > 0 && Math.abs(shareTotal - 100) < 0.01;

  return (
    <div className="space-y-4 rounded-lg border bg-background p-3 md:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Article {index + 1}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label={`Supprimer l’article ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-6">
          <Label>Désignation</Label>
          <Input
            value={article.label}
            placeholder="Ex. présentoir, tablette, emballage"
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </div>
        <div className="md:col-span-3">
          <Label>Poids unitaire (kg)</Label>
          <Input
            type="number"
            min={0}
            step="0.001"
            inputMode="decimal"
            value={article.unitWeightKg ?? ""}
            placeholder="Ex. 2,450"
            onChange={(event) => onChange({ unitWeightKg: readOptionalNumber(event.target.value) })}
          />
        </div>
        <div className="md:col-span-3">
          <Label>Qté par ensemble</Label>
          <Input
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            value={article.quantityPerSet ?? ""}
            onChange={(event) =>
              onChange({ quantityPerSet: readOptionalNumber(event.target.value) })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>Composition matière</Label>
            <div
              className={`text-[11px] ${compositionComplete ? "text-emerald-700" : "text-amber-700"}`}
            >
              Total : {shareTotal.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %
              {compositionComplete ? " — complet" : " — à compléter jusqu’à 100 %"}
            </div>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={addMaterial}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter une matière
          </Button>
        </div>

        {article.materials.length === 0 ? (
          <button
            type="button"
            className="w-full rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground hover:border-primary hover:text-primary"
            onClick={addMaterial}
          >
            Ajouter une matière
          </button>
        ) : (
          article.materials.map((material, materialIndex) => (
            <div
              key={material.id}
              className="grid grid-cols-1 items-end gap-2 rounded-md border p-2 sm:grid-cols-12"
            >
              <div className="sm:col-span-5">
                <Label className="text-xs">Matière</Label>
                <Select
                  value={material.materialId || undefined}
                  onValueChange={(materialId) =>
                    updateMaterial(materialIndex, {
                      materialId,
                      otherLabel: materialId === "other" ? material.otherLabel : "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une matière" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARBON_MATERIALS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Part (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  inputMode="decimal"
                  value={material.sharePct ?? ""}
                  onChange={(event) =>
                    updateMaterial(materialIndex, {
                      sharePct: readOptionalNumber(event.target.value),
                    })
                  }
                />
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs">Matière recyclée (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  inputMode="decimal"
                  value={material.recycledPct ?? ""}
                  placeholder="Si connu"
                  onChange={(event) =>
                    updateMaterial(materialIndex, {
                      recycledPct: readOptionalNumber(event.target.value),
                    })
                  }
                />
              </div>
              <div className="flex justify-end sm:col-span-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  aria-label={`Supprimer la matière ${materialIndex + 1}`}
                  onClick={() => removeMaterial(materialIndex)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
              {material.materialId === "other" && (
                <div className="sm:col-span-12">
                  <Label className="text-xs">Nom de la matière</Label>
                  <Input
                    value={material.otherLabel ?? ""}
                    placeholder="Précisez la matière"
                    onChange={(event) =>
                      updateMaterial(materialIndex, { otherLabel: event.target.value })
                    }
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

