import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, FolderKanban, LogOut, Shield } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setFullName(data?.full_name || data?.email || ""));
  }, [user]);

  const nav = [
    { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/dossiers", label: "Dossiers", icon: FolderKanban },
  ];

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

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
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {nav.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                }`}
              >
                <n.icon className="w-4 h-4" />
                {n.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              to="/admin"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
              }`}
            >
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
