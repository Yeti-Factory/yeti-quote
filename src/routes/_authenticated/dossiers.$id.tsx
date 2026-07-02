import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Copy, Save, Trash2, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { StandardForm } from "@/components/calc/StandardForm";
import { ContraForm } from "@/components/calc/ContraForm";
import { KitsForm } from "@/components/calc/KitsForm";
import { StandsForm } from "@/components/calc/StandsForm";
import { ResultsPanel } from "@/components/calc/ResultsPanel";
import { PrintableDossier } from "@/components/calc/PrintableDossier";

import { calculerStandard, STANDARD_DEFAULTS, type StandardInput } from "@/lib/calculs/standard";
import { calculerContra, CONTRA_DEFAULTS, type ContraInput } from "@/lib/calculs/contra";
import { calculerKits, KITS_DEFAULTS, type KitsInput } from "@/lib/calculs/kits";
import {
  calculerStands,
  STANDS_DEFAULTS,
  STANDS_SECTIONS_DEFAUT,
  type StandsInput,
} from "@/lib/calculs/stands";

export const Route = createFileRoute("/_authenticated/dossiers/$id")({
  component: DossierDetail,
});

function defaultPayload(type: string, params: any) {
  if (type === "standard") {
    return {
      quantites: [],
      achatsPrincipaux: [{ fournisseur: "", libelle: "", prixUnitaire: 0, margePct: null }],
      achatsAnnexes: [{ fournisseur: "", libelle: "", montantGlobal: 0, margePct: null }],
      params: { ...STANDARD_DEFAULTS, ...(params ?? {}) },
    } satisfies StandardInput;
  }
  if (type === "contra") {
    return {
      quantites: [],
      achatsContra: [{ fournisseur: "", libelle: "", prixUnitaire: 0, margePct: null }],
      forfaitsContra: [{ fournisseur: "", libelle: "", montantGlobal: 0, margePct: null }],
      achatsAutres: [{ fournisseur: "", libelle: "", prixUnitaire: 0, margePct: null }],
      params: { ...CONTRA_DEFAULTS, ...(params ?? {}) },
    } satisfies ContraInput;
  }
  if (type === "kits") {
    // Kits type is hidden but kept for legacy dossiers.
    return {
      variantes: [
        { libelle: "V1", nbKits: 0 },
        { libelle: "V2", nbKits: 0 },
      ],
      elements: [{ libelle: "", prixAchatUnit: 0, qtyParVariante: [0, 0] }],
      params: { ...KITS_DEFAULTS, ...(params ?? {}) },
    } satisfies KitsInput;
  }
  // stands
  return {
    quantites: [{ qty: 1, margePct: null }],
    sections: STANDS_SECTIONS_DEFAUT.map((l) => ({ libelle: l, lignes: [], margePct: null })),
    params: { ...STANDS_DEFAULTS, ...(params ?? {}) },
  } satisfies StandsInput;
}

function DossierDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);

  const { data: dossier } = useQuery({
    queryKey: ["dossier", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .select("*, clients(id, entreprise, contact, email)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: defaults } = useQuery({
    queryKey: ["app_defaults"],
    queryFn: async () => {
      const { data } = await supabase.from("app_defaults").select("key,value");
      return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
    },
  });

  const [meta, setMeta] = useState({
    reference: "",
    objet: "",
    onedrive_note: "",
    statut: "brouillon" as "brouillon" | "valide" | "archive",
  });
  const [payload, setPayload] = useState<any>(null);
  const initialSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    if (!dossier) return;
    const nextMeta = {
      reference: dossier.reference,
      objet: dossier.objet,
      onedrive_note: dossier.onedrive_note ?? "",
      statut: dossier.statut,
    };
    setMeta(nextMeta);
    const hasPayload = dossier.payload && Object.keys(dossier.payload).length > 0;
    let nextPayload: any = null;
    if (hasPayload) {
      nextPayload = dossier.payload;
    } else if (defaults) {
      nextPayload = defaultPayload(dossier.type, defaults[dossier.type]);
    }
    if (nextPayload) {
      setPayload(nextPayload);
      initialSnapshotRef.current = JSON.stringify({ meta: nextMeta, payload: nextPayload });
    }
  }, [dossier, defaults]);

  const currentSnapshot = useMemo(
    () => (payload ? JSON.stringify({ meta, payload }) : null),
    [meta, payload],
  );
  const isDirty =
    currentSnapshot !== null &&
    initialSnapshotRef.current !== null &&
    currentSnapshot !== initialSnapshotRef.current;

  // Warn on tab close / refresh
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Block internal navigation
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => isDirty,
    withResolver: true,
    enableBeforeUnload: false,
  });

  const output = useMemo(() => {
    if (!dossier || !payload) return null;
    if (dossier.type === "standard") return calculerStandard(payload);
    if (dossier.type === "contra") return calculerContra(payload);
    if (dossier.type === "kits") return calculerKits(payload);
    if (dossier.type === "stands") return calculerStands(payload);
    return null;
  }, [dossier, payload]);

  async function save(nextStatut?: "brouillon" | "valide" | "archive") {
    if (!dossier || !payload || !output) return;
    const update: any = {
      reference: meta.reference.trim(),
      objet: meta.objet.trim(),
      onedrive_note: meta.onedrive_note,
      statut: nextStatut ?? meta.statut,
      payload,
      results: output,
      params: payload.params,
    };
    const { error } = await supabase.from("dossiers").update(update).eq("id", dossier.id);
    if (error) return toast.error(error.message);
    toast.success(nextStatut === "valide" ? "Dossier validé" : "Enregistré");
    const savedMeta = nextStatut ? { ...meta, statut: nextStatut } : meta;
    if (nextStatut) setMeta(savedMeta);
    initialSnapshotRef.current = JSON.stringify({ meta: savedMeta, payload });
    qc.invalidateQueries({ queryKey: ["dossier", id] });
    qc.invalidateQueries({ queryKey: ["dossiers"] });
  }

  async function duplicate() {
    if (!dossier) return;
    const { data, error } = await supabase
      .from("dossiers")
      .insert({
        reference: "",
        objet: `${dossier.objet} (copie)`,
        client_id: dossier.client_id,
        contact: dossier.contact,
        email: dossier.email,
        type: dossier.type,
        statut: "brouillon",
        onedrive_note: dossier.onedrive_note,
        payload: dossier.payload,
        params: dossier.params,
        results: dossier.results,
        created_by: user!.id,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Dossier dupliqué");
    navigate({ to: "/dossiers/$id", params: { id: data.id } });
  }

  async function del() {
    if (!dossier) return;
    const { error } = await supabase.from("dossiers").delete().eq("id", dossier.id);
    if (error) return toast.error(error.message);
    toast.success("Dossier supprimé");
    navigate({ to: "/dossiers" });
  }

  if (!dossier || !payload) return <div className="text-sm text-muted-foreground">Chargement…</div>;

  return (
    <>
      <div className="screen-only">
        <Link
          to="/dossiers"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Retour aux dossiers
        </Link>
        <PageHeader
          title={meta.objet || "(Sans objet)"}
          subtitle={`${meta.reference} · ${dossier.clients?.entreprise ?? ""} · type ${dossier.type}`}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1.5" />
                Imprimer / PDF
              </Button>
              <Button variant="outline" onClick={duplicate}>
                <Copy className="w-4 h-4 mr-1.5" />
                Dupliquer
              </Button>
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-destructive">
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Supprimer
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer définitivement ce dossier ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible. Le client associé n'est pas supprimé.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction onClick={del}>Supprimer</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                onClick={() => save()}
                className={
                  isDirty
                    ? "bg-[hsl(var(--yeti-orange))] text-white hover:bg-[hsl(var(--yeti-orange))]/90 shadow-lg ring-2 ring-[hsl(var(--yeti-orange))]/40 animate-pulse"
                    : ""
                }
              >
                <Save className="w-4 h-4 mr-1.5" />
                {isDirty ? "Enregistrer *" : "Enregistrer"}
              </Button>
              {meta.statut !== "valide" && (
                <Button variant="default" onClick={() => save("valide")}>
                  Valider
                </Button>
              )}
              {meta.statut !== "archive" && (
                <Button variant="outline" onClick={() => save("archive")}>
                  Archiver
                </Button>
              )}
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Card className="p-4 space-y-3 lg:col-span-1">
            <div>
              <Label>Référence</Label>
              <Input
                value={meta.reference}
                onChange={(e) => setMeta({ ...meta, reference: e.target.value })}
              />
            </div>
            <div>
              <Label>Objet</Label>
              <Input
                value={meta.objet}
                onChange={(e) => setMeta({ ...meta, objet: e.target.value })}
              />
            </div>
            <div>
              <Label>Statut</Label>
              <Select
                value={meta.statut}
                onValueChange={(v) => setMeta({ ...meta, statut: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brouillon">Brouillon</SelectItem>
                  <SelectItem value="valide">Validé</SelectItem>
                  <SelectItem value="archive">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note / lien dossier OneDrive</Label>
              <Textarea
                rows={3}
                value={meta.onedrive_note}
                onChange={(e) => setMeta({ ...meta, onedrive_note: e.target.value })}
              />
            </div>
          </Card>

          <div className="lg:col-span-2 space-y-4">
            {dossier.type === "standard" && <StandardForm value={payload} onChange={setPayload} />}
            {dossier.type === "contra" && <ContraForm value={payload} onChange={setPayload} />}
            {dossier.type === "kits" && output && (
              <KitsForm value={payload} onChange={setPayload} output={output as any} />
            )}
            {dossier.type === "stands" && <StandsForm value={payload} onChange={setPayload} />}
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-2">Résultats</h2>
        {dossier.type !== "kits" && output && <ResultsPanel output={output as any} />}
        {dossier.type === "kits" && (
          <Card className="p-4 text-sm text-muted-foreground">
            Voir le récapitulatif dans le formulaire ci-dessus (totaux et PV par élément calculés en
            temps réel).
          </Card>
        )}
      </div>

      {dossier.type !== "kits" && (
        <PrintableDossier
          meta={{
            reference: meta.reference,
            objet: meta.objet,
            clientName: dossier.clients?.entreprise ?? "",
            userName: user?.email ?? "",
            type: dossier.type,
            onedriveNote: meta.onedrive_note,
          }}
          type={dossier.type}
          payload={payload}
        />
      )}
    </>
  );
}
