import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  LogOut,
  Shield,
  ChevronRight,
  Menu,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { backend } from "@/integrations/native/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { InstallAppButton } from "@/components/InstallAppButton";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const [fullName, setFullName] = useState<string>("");
  const [clientsOpen, setClientsOpen] = useState<boolean>(() => pathname.startsWith("/clients"));

  useEffect(() => {
    setMenuOpen(false);
    if (pathname.startsWith("/clients")) setClientsOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!user) return;
    backend
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
      const { data } = await backend
        .from("clients")
        .select("id, entreprise")
        .order("entreprise", { ascending: true });
      return data ?? [];
    },
  });

  async function signOut() {
    await backend.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const linkCls = (active: boolean) =>
    `flex min-h-11 items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
    }`;

  const navigation = (
    <>
      <div className="px-5 py-5 pr-12 md:pr-5 border-b border-sidebar-border flex items-center gap-3">
        <img src="/yeti-logo.png" alt="Yeti Factory" className="h-8 w-auto object-contain" />
        <div>
          <div className="text-xs uppercase tracking-wider text-sidebar-foreground/60 leading-tight">
            Calcul de prix
          </div>
        </div>
      </div>
      <nav
        aria-label="Navigation principale"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setMenuOpen(false);
        }}
        className="min-h-0 flex-1 px-2 py-3 space-y-0.5 overflow-y-auto"
      >
        <Link to="/dashboard" className={linkCls(pathname.startsWith("/dashboard"))}>
          <LayoutDashboard className="w-4 h-4" />
          Tableau de bord
        </Link>

        <div className="flex items-center">
          <Link to="/clients" className={`${linkCls(pathname.startsWith("/clients"))} flex-1`}>
            <Users className="w-4 h-4" />
            Clients
          </Link>
          <button
            type="button"
            onClick={() => setClientsOpen((v) => !v)}
            aria-label={clientsOpen ? "Replier les clients" : "Déplier les clients"}
            className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent/60"
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${clientsOpen ? "rotate-90" : ""}`}
            />
          </button>
        </div>
        {clientsOpen && (
          <div className="ml-6 mt-0.5 mb-1 max-h-64 overflow-y-auto pr-1 border-l border-sidebar-border/60">
            {(clientsList ?? []).length === 0 && (
              <div className="px-3 py-1.5 text-xs text-sidebar-foreground/50">Aucun client</div>
            )}
            {(clientsList ?? []).map((c: any) => {
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
        <div className="text-xs text-sidebar-foreground/70 px-1 pt-1 pb-1 truncate">{fullName}</div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4 mr-2" /> Déconnexion
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-muted/30 md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        {navigation}
      </aside>
      <main className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
          <Sheet open={menuOpen && isMobile} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex h-dvh w-[min(20rem,85vw)] flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">Menu YetiQuote</SheetTitle>
              <SheetDescription className="sr-only">
                Navigation entre le tableau de bord, les clients et les dossiers.
              </SheetDescription>
              {navigation}
            </SheetContent>
          </Sheet>
          <img src="/yeti-logo.png" alt="Yeti Factory" className="h-7 w-auto" />
          <span className="text-xs uppercase tracking-wider">Calcul de prix</span>
        </header>
        <div className="w-full px-4 py-5 sm:px-6 sm:py-6 2xl:px-8">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
