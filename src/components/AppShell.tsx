import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  LogOut,
  Shield,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { InstallAppButton } from "@/components/InstallAppButton";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [fullName, setFullName] = useState<string>("");
  const [clientsOpen, setClientsOpen] = useState<boolean>(() =>
    pathname.startsWith("/clients"),
  );

  useEffect(() => {
    if (pathname.startsWith("/clients")) setClientsOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setFullName(data?.full_name || data?.email || ""));
  }, [user]);

  const { data: clientsList } = useQuery({
    queryKey: ["sidebar-clients"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, entreprise")
        .order("entreprise", { ascending: true });
      return data ?? [];
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const linkCls = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
    }`;

  return (
    <div className="min-h-screen bg-muted/30 flex">
      <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
          <img src="/yeti-logo.png" alt="Yeti Factory" className="h-8 w-auto object-contain" />
          <div>
            <div className="text-xs uppercase tracking-wider text-sidebar-foreground/60 leading-tight">
              Calcul de prix
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <Link to="/dashboard" className={linkCls(pathname.startsWith("/dashboard"))}>
            <LayoutDashboard className="w-4 h-4" />
            Tableau de bord
          </Link>

          <div className="flex items-center">
            <Link
              to="/clients"
              className={`${linkCls(pathname.startsWith("/clients"))} flex-1`}
            >
              <Users className="w-4 h-4" />
              Clients
            </Link>
            <button
              type="button"
              onClick={() => setClientsOpen((v) => !v)}
              aria-label={clientsOpen ? "Replier les clients" : "Déplier les clients"}
              className="ml-1 p-1.5 rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent/60"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${clientsOpen ? "rotate-90" : ""}`}
              />
            </button>
          </div>
          {clientsOpen && (
            <div className="ml-6 mt-0.5 mb-1 max-h-64 overflow-y-auto pr-1 border-l border-sidebar-border/60">
              {(clientsList ?? []).length === 0 && (
                <div className="px-3 py-1.5 text-xs text-sidebar-foreground/50">
                  Aucun client
                </div>
              )}
              {(clientsList ?? []).map((c) => {
                const active = pathname === `/clients/${c.id}`;
                return (
                  <Link
                    key={c.id}
                    to="/clients/$id"
                    params={{ id: c.id }}
                    className={`block px-3 py-1.5 text-xs rounded-md truncate transition-colors ${
                      active
                        ? "text-sidebar-accent-foreground font-medium bg-sidebar-accent/60"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                    }`}
                  >
                    {c.entreprise}
                  </Link>
                );
              })}
            </div>
          )}

          <Link to="/dossiers" className={linkCls(pathname.startsWith("/dossiers"))}>
            <FolderKanban className="w-4 h-4" />
            Dossiers
          </Link>

          {isAdmin && (
            <Link to="/admin" className={linkCls(pathname.startsWith("/admin"))}>
              <Shield className="w-4 h-4" />
              Administration
            </Link>
          )}
        </nav>
        <div className="px-3 py-3 border-t border-sidebar-border space-y-1">
          <InstallAppButton />
          <div className="text-xs text-muted-foreground px-1 pt-1 pb-1 truncate">{fullName}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Déconnexion
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}

