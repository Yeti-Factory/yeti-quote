import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, ExternalLink, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/install")({
  component: InstallPage,
  head: () => ({
    meta: [
      { title: "Installer Yeti Quote" },
      { name: "description", content: "Installez l'application Yeti Quote sur votre appareil." },
    ],
  }),
});

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function InstallPage() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInstalled(isStandalone());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setStatus("Application installée ✓");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferred) {
      setStatus(
        "Votre navigateur ne propose pas l'installation automatique. Suivez les instructions ci-dessous.",
      );
      return;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    setStatus(
      choice.outcome === "accepted" ? "Installation lancée…" : "Installation annulée.",
    );
  }

  const ios = mounted && isIos();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <img src="/yeti-logo.png" alt="Yeti Factory" className="h-16 w-auto" />
        </div>

        <div className="rounded-2xl border border-white/10 bg-neutral-950 p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-center">Installer Yeti Quote</h1>
          <p className="mt-3 text-sm text-neutral-300 text-center leading-relaxed">
            Installez l'application sur votre ordinateur ou mobile pour y accéder rapidement,
            comme une application native.
          </p>

          {installed ? (
            <div className="mt-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-center text-sm text-emerald-300">
              L'application est déjà installée sur cet appareil.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <Button
                onClick={handleInstall}
                className="w-full bg-[#ff7a00] hover:bg-[#ff8a1a] text-black font-semibold h-12 text-base"
              >
                <Download className="w-5 h-5 mr-2" />
                Installer l'application
              </Button>
              <Button asChild variant="outline" className="w-full h-11 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link to="/">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ouvrir Yeti Quote
                </Link>
              </Button>
            </div>
          )}

          {status && (
            <p className="mt-4 text-center text-xs text-neutral-400">{status}</p>
          )}

          <div className="mt-8 border-t border-white/10 pt-6 space-y-4 text-sm text-neutral-300">
            <h2 className="font-semibold text-white">Instructions manuelles</h2>
            {ios ? (
              <p className="leading-relaxed">
                Sur iPhone / iPad, ouvrez cette page dans <strong>Safari</strong>, appuyez sur le
                bouton <Share className="inline w-4 h-4 mx-1 align-text-bottom" />{" "}
                <strong>Partager</strong>, puis choisissez{" "}
                <strong>Ajouter à l'écran d'accueil</strong>.
              </p>
            ) : (
              <>
                <p className="leading-relaxed">
                  <strong>Chrome / Edge (Windows, Mac, Android)</strong> : ouvrez le menu{" "}
                  <span className="font-mono">⋯</span> puis choisissez{" "}
                  <strong>Installer cette application</strong> ou{" "}
                  <strong>Installer Yeti Quote</strong>.
                </p>
                <p className="leading-relaxed">
                  <strong>Safari (iPhone / iPad)</strong> : bouton{" "}
                  <Share className="inline w-4 h-4 mx-1 align-text-bottom" /> Partager →{" "}
                  <strong>Ajouter à l'écran d'accueil</strong>.
                </p>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Yeti Factory — Yeti Quote
        </p>
      </div>
    </div>
  );
}
