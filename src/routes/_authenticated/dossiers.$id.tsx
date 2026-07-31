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
import { ArrowLeft, Copy, Download, Save, Trash2, Printer } from "lucide-react";
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
import { OfferEmailDialog } from "@/components/calc/OfferEmailDialog";
import { createDossierBackup, saveDossierBackup } from "@/lib/dossier-backup";

import { calculerStandard, STANDARD_DEFAULTS, type StandardInput } from "@/lib/calculs/standard";
import { calculerContra, CONTRA_DEFAULTS, type ContraInput } from "@/lib/calculs/contra";
import { calculerKits, KITS_DEFAULTS, type KitsInput } from "@/lib/calculs/kits";
import { reshapePrixParQuantite } from "@/lib/calculs/types";
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
      achatsPrincipaux: [
        { fournisseur: "", libelle: "", commentaire: "", prixUnitaire: 0, margePct: null },
      ],
      transportPackaging: { montantsGlobaux: [], transportInclus: false, margePct: null },
      params: { ...STANDARD_DEFAULTS, ...(params ?? {}) },
    } satisfies StandardInput;
  }
  if (type === "contra") {
    return {
      quantites: [],
      achatsContra: [
        { fournisseur: "", libelle: "", commentaire: "", prixUnitaire: 0, margePct: null },
      ],
      forfaitsContra: [
        { fournisseur: "", libelle: "", commentaire: "", montantGlobal: 0, margePct: null },
      ],
      transportPackaging: { montantsGlobaux: [], transportInclus: false, margePct: null },
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

function toOptionalNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function contraToStandardPayload(input: ContraInput, standardDefaults: any): StandardInput {
  const quantites = Array.isArray(input.quantites) ? input.quantites : [];
  const qCount = quantites.length;
  const contraParams = input.params ?? CONTRA_DEFAULTS;
  const baseParams = { ...STANDARD_DEFAULTS, ...(standardDefaults ?? {}) };
  const params = {
    ...baseParams,
    frais_fixes_pct: toOptionalNumber(contraParams.frais_fixes_pct) ?? baseParams.frais_fixes_pct,
    commission_rapporteur_pct:
      toOptionalNumber(contraParams.commission_rapporteur_pct) ??
      baseParams.commission_rapporteur_pct,
  };

  const achatsPrincipaux = [
    ...(Array.isArray(input.achatsContra) ? input.achatsContra : []).map((line) => ({
      fournisseur: line.fournisseur ?? "",
      libelle: line.libelle ?? "",
      descriptif: line.descriptif ?? "",
      commentaire: line.commentaire ?? "",
      prixUnitaire: line.prixUnitaire ?? 0,
      prixParQuantite: reshapePrixParQuantite(line, qCount),
      margePct: line.margePct ?? null,
    })),
    ...(Array.isArray(input.forfaitsContra) ? input.forfaitsContra : []).map((line) => {
      const montantGlobal = Number(line.montantGlobal) || 0;
      return {
        fournisseur: line.fournisseur ?? "",
        libelle: line.libelle ? `Forfait - ${line.libelle}` : "Forfait",
        descriptif: line.descriptif ?? "",
        commentaire: line.commentaire ?? "",
        prixUnitaire: 0,
        prixParQuantite: quantites.map((quant) => {
          const qty = Number(quant?.qty) || 0;
          return qty > 0 ? montantGlobal / qty : 0;
        }),
        margePct: line.margePct ?? null,
      };
    }),
  ];

  return {
    quantites,
    achatsPrincipaux:
      achatsPrincipaux.length > 0
        ? achatsPrincipaux
        : [{ fournisseur: "", libelle: "", commentaire: "", prixUnitaire: 0, margePct: null }],
    transportPackaging: input.transportPackaging ?? {
      montantsGlobaux: Array.from({ length: qCount }, () => 0),
      transportInclus: false,
      margePct: null,
    },
    params,
  };
}

function standardToContraPayload(input: StandardInput, contraDefaults: any): ContraInput {
  const quantites = Array.isArray(input.quantites) ? input.quantites : [];
  const qCount = quantites.length;
  const standardParams = input.params ?? STANDARD_DEFAULTS;
  const baseParams = { ...CONTRA_DEFAULTS, ...(contraDefaults ?? {}) };
  const params = {
    ...baseParams,
    frais_fixes_pct: toOptionalNumber(standardParams.frais_fixes_pct) ?? baseParams.frais_fixes_pct,
    commission_sourcing:
      typeof standardParams.commission_sourcing === "boolean"
        ? standardParams.commission_sourcing
        : baseParams.commission_sourcing,
    commission_sourcing_pct:
      toOptionalNumber(standardParams.commission_sourcing_pct) ??
      baseParams.commission_sourcing_pct,
    commission_sourcing_min_eur:
      toOptionalNumber(standardParams.commission_sourcing_min_eur) ??
      baseParams.commission_sourcing_min_eur,
    commission_rapporteur_pct:
      toOptionalNumber(standardParams.commission_rapporteur_pct) ??
      baseParams.commission_rapporteur_pct,
  };

  const achatsContra = (Array.isArray(input.achatsPrincipaux) ? input.achatsPrincipaux : []).map(
    (line) => ({
      fournisseur: line.fournisseur ?? "",
      libelle: line.libelle ?? "",
      descriptif: line.descriptif ?? "",
      commentaire: line.commentaire ?? "",
      prixUnitaire: line.prixUnitaire ?? 0,
      prixParQuantite: reshapePrixParQuantite(line, qCount),
      margePct: line.margePct ?? null,
    }),
  );

  return {
    quantites,
    achatsContra:
      achatsContra.length > 0
        ? achatsContra
        : [{ fournisseur: "", libelle: "", commentaire: "", prixUnitaire: 0, margePct: null }],
    forfaitsContra: [],
    transportPackaging: input.transportPackaging ?? {
      montantsGlobaux: Array.from({ length: qCount }, () => 0),
      transportInclus: false,
      margePct: null,
    },
    params,
  };
}

function convertBetweenStandardAndContra(
  fromType: "standard" | "contra",
  toType: "standard" | "contra",
  input: any,
  defaults: any,
) {
  if (fromType === toType) return input;
  if (fromType === "contra" && toType === "standard") {
    return contraToStandardPayload(input as ContraInput, defaults?.standard);
  }
  if (fromType === "standard" && toType === "contra") {
    return standardToContraPayload(input as StandardInput, defaults?.contra);
  }
  return null;
}

function calculateForType(type: "standard" | "contra", nextPayload: any) {
  if (type === "standard") return calculerStandard(nextPayload as StandardInput);
  return calculerContra(nextPayload as ContraInput);
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
        .select(
          "*, clients(id, entreprise, contact, civilite, prenom, nom, email, telephone, adresse, notes, created_at, updated_at)",
        )
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
  const [pendingType, setPendingType] = useState<"standard" | "contra" | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
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
    // Legacy → new: migrate achatsAnnexes (Standard) / achatsAutres (Contra)
    // into transportPackaging. We keep the legacy arrays in the payload so a
    // banner can be shown until the user re-saves the dossier.
    let legacyMigrated = false;
    if (nextPayload && (dossier.type === "standard" || dossier.type === "contra")) {
      const qArr: Array<{ qty: number }> = Array.isArray(nextPayload.quantites)
        ? nextPayload.quantites
        : [];
      const qCount = qArr.length;
      const existingTP = nextPayload.transportPackaging;
      const tpEmpty =
        !existingTP ||
        !Array.isArray(existingTP.montantsGlobaux) ||
        existingTP.montantsGlobaux.every((v: any) => !Number(v));

      // Per-quantity global amount to inject into T/P.
      const montants = Array.from({ length: qCount }, () => 0);
      let hasLegacy = false;

      if (dossier.type === "standard" && Array.isArray(nextPayload.achatsAnnexes)) {
        const sumForfait = nextPayload.achatsAnnexes.reduce(
          (s: number, l: any) => s + (Number(l?.montantGlobal) || 0),
          0,
        );
        if (sumForfait > 0) {
          hasLegacy = true;
          for (let i = 0; i < qCount; i++) montants[i] += sumForfait;
        }
      }
      if (dossier.type === "contra" && Array.isArray(nextPayload.achatsAutres)) {
        for (let i = 0; i < qCount; i++) {
          const Q = Number(qArr[i]?.qty) || 0;
          let unit = 0;
          for (const l of nextPayload.achatsAutres) {
            const perQ = Array.isArray(l?.prixParQuantite) ? Number(l.prixParQuantite[i]) : NaN;
            const fallback = Number(l?.prixAchat) || Number(l?.prixUnitaire) || 0;
            unit += Number.isFinite(perQ) && perQ > 0 ? perQ : fallback;
          }
          if (unit > 0) {
            hasLegacy = true;
            montants[i] += unit * Q;
          }
        }
      }

      if (hasLegacy && tpEmpty) {
        nextPayload = {
          ...nextPayload,
          transportPackaging: {
            montantsGlobaux: montants,
            transportInclus: existingTP?.transportInclus === true,
            margePct: existingTP?.margePct ?? null,
          },
          _legacyMigrated: true,
        };
        legacyMigrated = true;
      } else if (!existingTP) {
        nextPayload = {
          ...nextPayload,
          transportPackaging: {
            montantsGlobaux: Array.from({ length: qCount }, () => 0),
            transportInclus: false,
            margePct: null,
          },
        };
      }
      // If T/P already had data AND legacy arrays still exist non-empty, warn.
      if (
        !legacyMigrated &&
        ((Array.isArray(nextPayload.achatsAnnexes) && nextPayload.achatsAnnexes.length > 0) ||
          (Array.isArray(nextPayload.achatsAutres) && nextPayload.achatsAutres.length > 0))
      ) {
        nextPayload = { ...nextPayload, _legacyRemnants: true };
      }
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
    // Strip legacy fields once the user validates the migration.
    const {
      _legacyMigrated: _lm,
      _legacyRemnants: _lr,
      achatsAnnexes: _aa,
      achatsAutres: _au,
      ...cleanPayload
    } = payload;
    void _lm;
    void _lr;
    void _aa;
    void _au;
    const update: any = {
      reference: meta.reference.trim(),
      objet: meta.objet.trim(),
      onedrive_note: meta.onedrive_note,
      statut: nextStatut ?? meta.statut,
      payload: cleanPayload,
      results: output,
      params: cleanPayload.params,
    };
    const { error } = await supabase.from("dossiers").update(update).eq("id", dossier.id);
    if (error) return toast.error(error.message);
    toast.success(nextStatut === "valide" ? "Dossier validé" : "Enregistré");
    const savedMeta = nextStatut ? { ...meta, statut: nextStatut } : meta;
    if (nextStatut) setMeta(savedMeta);
    setPayload(cleanPayload);
    initialSnapshotRef.current = JSON.stringify({ meta: savedMeta, payload: cleanPayload });
    qc.invalidateQueries({ queryKey: ["dossier", id] });
    qc.invalidateQueries({ queryKey: ["dossiers"] });
  }

  async function changeModel(targetType: "standard" | "contra") {
    if (!dossier || !payload) return;
    const sourceType = dossier.type;
    if (sourceType === targetType) {
      setPendingType(null);
      return;
    }
    if (sourceType !== "standard" && sourceType !== "contra") {
      toast.error("Ce modele ne peut pas etre converti automatiquement");
      setPendingType(null);
      return;
    }

    const nextPayload = convertBetweenStandardAndContra(sourceType, targetType, payload, defaults);
    if (!nextPayload) {
      toast.error("Conversion impossible");
      setPendingType(null);
      return;
    }

    setModelBusy(true);
    try {
      const nextResults = calculateForType(targetType, nextPayload);
      const nextMeta = { ...meta, statut: "brouillon" as const };
      const update = {
        reference: meta.reference.trim(),
        objet: meta.objet.trim(),
        onedrive_note: meta.onedrive_note,
        statut: "brouillon" as const,
        type: targetType,
        payload: nextPayload,
        results: nextResults,
        params: nextPayload.params,
      };
      const { error } = await supabase.from("dossiers").update(update).eq("id", dossier.id);
      if (error) throw error;

      qc.setQueryData(["dossier", id], (current: any) =>
        current ? { ...current, ...update } : current,
      );
      setMeta(nextMeta);
      setPayload(nextPayload);
      initialSnapshotRef.current = JSON.stringify({ meta: nextMeta, payload: nextPayload });
      qc.invalidateQueries({ queryKey: ["dossier", id] });
      qc.invalidateQueries({ queryKey: ["dossiers"] });
      toast.success(`Modele change en ${targetType === "standard" ? "Standard" : "Contra"}`);
      setPendingType(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Changement de modele impossible");
    } finally {
      setModelBusy(false);
    }
  }

  async function duplicate() {
    if (!dossier) return;
    const nextVersion = ((dossier as any).version ?? 1) + 1;
    const { data, error } = await supabase
      .from("dossiers")
      .insert({
        reference: "",
        objet: dossier.objet,
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
        version: nextVersion,
      } as any)
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success(`Dossier dupliqué (v${nextVersion})`);
    navigate({ to: "/dossiers/$id", params: { id: data.id } });
  }

  async function duplicateAsStandard() {
    if (!dossier || !payload || dossier.type !== "contra") return;
    const standardPayload = contraToStandardPayload(payload as ContraInput, defaults?.standard);
    const standardResults = calculerStandard(standardPayload);
    const nextVersion = ((dossier as any).version ?? 1) + 1;
    const { data, error } = await supabase
      .from("dossiers")
      .insert({
        reference: "",
        objet: `${dossier.objet} - Standard`,
        client_id: dossier.client_id,
        contact: dossier.contact,
        email: dossier.email,
        type: "standard",
        statut: "brouillon",
        onedrive_note: dossier.onedrive_note,
        payload: standardPayload,
        params: standardPayload.params,
        results: standardResults,
        created_by: user!.id,
        version: nextVersion,
      } as any)
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Dossier duplique en Standard");
    navigate({ to: "/dossiers/$id", params: { id: data.id } });
  }

  async function exportDossier() {
    if (!dossier || !payload) return;
    const backup = createDossierBackup({
      dossier,
      meta,
      payload,
      results: output ?? {},
    });
    const result = await saveDossierBackup(backup);
    if (result === "saved") {
      toast.success("Dossier enregistre");
    } else if (result === "downloaded") {
      toast.success("Fichier telecharge");
    }
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
        {isDirty && (
          <div className="sticky top-0 z-40 mb-3 rounded-md border-2 border-primary bg-primary/10 px-4 py-3 shadow-md">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-primary">Modifications non enregistrées</p>
                <p className="text-sm text-foreground/80">
                  Cliquez sur Enregistrer avant de quitter cette page.
                </p>
              </div>
              <Button
                onClick={() => save()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Save className="w-4 h-4 mr-1.5" />
                Enregistrer
              </Button>
            </div>
          </div>
        )}
        {(payload?._legacyMigrated || payload?._legacyRemnants) && (
          <div className="mb-3 rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Dossier legacy migré</p>
            <p className="text-foreground/80">
              {payload._legacyMigrated
                ? "Les anciens blocs « Achats annexes » / « Achats autres » ont été convertis automatiquement dans « Transport / Packaging ». Vérifiez les montants par quantité, ajustez si besoin, puis enregistrez pour valider la migration."
                : "Ce dossier contient des données legacy (« Achats annexes » / « Achats autres ») qui n'ont pas été migrées car « Transport / Packaging » est déjà renseigné. Vérifiez les montants et enregistrez pour figer la structure."}
            </p>
          </div>
        )}
        <Link
          to="/dossiers"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Retour aux dossiers
        </Link>
        <PageHeader
          title={meta.objet || "(Sans objet)"}
          subtitle={`v${(dossier as any).version ?? 1} · ${dossier.clients?.entreprise ?? ""} · type ${dossier.type}`}
          actions={
            <div className="flex gap-2">
              {dossier.type !== "kits" && output && (
                <OfferEmailDialog dossier={dossier} meta={meta} payload={payload} output={output} />
              )}
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1.5" />
                Imprimer / PDF
              </Button>
              <Button variant="outline" onClick={exportDossier}>
                <Download className="w-4 h-4 mr-1.5" />
                Enregistrer sous
              </Button>
              <Button variant="outline" onClick={duplicate}>
                <Copy className="w-4 h-4 mr-1.5" />
                Dupliquer
              </Button>
              {dossier.type === "contra" && (
                <Button variant="outline" onClick={duplicateAsStandard}>
                  <Copy className="w-4 h-4 mr-1.5" />
                  Dupliquer en Standard
                </Button>
              )}
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
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg ring-2 ring-primary/40 animate-pulse"
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
              <Label>Modele de calcul</Label>
              <Select
                value={dossier.type}
                disabled={modelBusy || (dossier.type !== "standard" && dossier.type !== "contra")}
                onValueChange={(v) => {
                  if (v === dossier.type) return;
                  if (v === "standard" || v === "contra") setPendingType(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="contra">Contra</SelectItem>
                  {dossier.type === "stands" && <SelectItem value="stands">Stands</SelectItem>}
                  {dossier.type === "kits" && <SelectItem value="kits">Kits</SelectItem>}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Conversion directe disponible entre Standard et Contra.
              </p>
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

      <AlertDialog open={status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous avez des modifications non enregistrées. Si vous quittez cette page maintenant,
              elles seront perdues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => reset?.()}>Rester sur la page</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => proceed?.()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Quitter sans enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingType !== null}
        onOpenChange={(open) => {
          if (!open && !modelBusy) setPendingType(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Changer le modele de calcul ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le dossier existant sera converti en{" "}
              <strong>{pendingType === "standard" ? "Standard" : "Contra"}</strong> et repassera en
              brouillon. Les informations communes seront conservees, mais les calculs propres au
              modele seront recalcules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={modelBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={modelBusy || pendingType === null}
              onClick={(event) => {
                event.preventDefault();
                if (pendingType) void changeModel(pendingType);
              }}
            >
              {modelBusy ? "Conversion..." : "Changer le modele"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
