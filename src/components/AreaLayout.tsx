import { LogoAutoClean } from "@/components/LogoAutoClean";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LoaderCircle, LogOut, Menu, ShieldCheck, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function AreaLayout({
  titulo,
  nome,
  children,
  navigation,
  secao,
}: {
  titulo: string;
  nome: string;
  children: ReactNode;
  navigation?: ReactNode;
  secao?: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="lc-workspace min-h-screen bg-background lg:grid lg:grid-cols-[248px_minmax(0,1fr)] 2xl:grid-cols-[272px_minmax(0,1fr)]">
      <a href="#conteudo-principal" className="lc-skip">
        Pular para o conteúdo
      </a>
      <aside className="lc-sidebar sticky top-0 hidden h-dvh flex-col px-4 py-6 lg:flex">
        <div className="mb-8 px-3">
          <LogoAutoClean className="mb-4 aspect-square w-full rounded-xl object-contain" />
          <p className="lc-brand text-white">
            Auto Clean<span className="text-[var(--brand-cyan)]">.</span>
          </p>
          <p className="mt-1 text-xs text-sidebar-foreground/70">Gestão do lava jato</p>
        </div>
        <p className="mb-3 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/60">
          Seu espaço de trabalho
        </p>
        {navigation}
        <div className="mt-auto border-t border-sidebar-border px-3 pt-5">
          <p className="flex items-center gap-2 text-xs text-sidebar-foreground/80">
            <ShieldCheck className="size-4 text-[var(--brand-cyan)]" aria-hidden="true" />
            {titulo}
          </p>
        </div>
      </aside>
      <div className="min-w-0 lg:grid lg:h-dvh lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:min-h-20 sm:px-7 lg:static lg:px-8 xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <LogoAutoClean className="size-12 shrink-0 rounded-lg object-contain lg:hidden" />
            <div>
              <p className="lc-eyebrow hidden lg:block">Auto Clean / Gestão</p>
              <p className="text-sm font-semibold sm:text-base">{secao ?? titulo}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden size-9 items-center justify-center rounded-full border bg-muted text-primary sm:flex">
              <UserRound className="size-4" aria-hidden="true" />
            </div>
            <div className="hidden max-w-48 sm:block">
              <p className="truncate text-sm font-semibold">{nome}</p>
              <p className="text-xs text-muted-foreground">{titulo}</p>
            </div>
            <Button onClick={sair} disabled={saindo} aria-busy={saindo} variant="ghost" size="sm">
              {saindo ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              {saindo ? "Saindo..." : "Sair"}
            </Button>
          </div>
        </header>
        <div className="min-w-0 lg:overflow-y-auto">
          <div className="px-3 pt-3 sm:px-6 sm:pt-4 lg:hidden">
            <details className="lc-sidebar lc-mobile-nav">
              <summary>
                <Menu className="size-4" aria-hidden="true" />
                <span>Menu do sistema</span>
                <span className="ml-auto text-xs text-sidebar-foreground/70">{secao}</span>
              </summary>
              {navigation}
            </details>
          </div>
          <main
            id="conteudo-principal"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1600px] p-3 pb-10 sm:p-6 lg:p-8 xl:p-10"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
