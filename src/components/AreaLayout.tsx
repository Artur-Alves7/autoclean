import { LogoAutoClean } from "@/components/LogoAutoClean";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ChevronDown, LoaderCircle, LogOut, Menu, ShieldCheck, UserRound } from "lucide-react";
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
    <div className="lc-workspace min-h-dvh bg-background lg:grid lg:grid-cols-[264px_minmax(0,1fr)] 2xl:grid-cols-[288px_minmax(0,1fr)]">
      <a href="#conteudo-principal" className="lc-skip">
        Pular para o conteúdo
      </a>
      <aside className="lc-sidebar sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border px-4 py-6 lg:flex">
        <div className="mb-8 px-3">
          <LogoAutoClean className="mb-5 aspect-square w-full rounded-2xl object-contain shadow-2xl" />
          <p className="lc-brand text-white">Auto Clean</p>
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
        <header className="sticky top-0 z-30 flex min-h-24 items-center justify-between gap-2 border-b bg-card/95 px-3 backdrop-blur-md sm:gap-3 sm:px-6 lg:static lg:min-h-20 lg:px-8 xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <LogoAutoClean className="lc-mobile-logo object-contain lg:hidden" />
            <details className="lc-header-nav group lg:hidden">
              <summary aria-label={`Abrir menu do sistema. Seção atual: ${secao ?? titulo}`}>
                <Menu className="size-4" aria-hidden="true" />
                <span className="min-[360px]:hidden">Menu</span>
                <span className="hidden min-[360px]:inline">Menu do sistema</span>
                <ChevronDown
                  className="size-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              {navigation}
            </details>
            <div className="hidden min-w-0 lg:block">
              <p className="lc-eyebrow">Auto Clean / Gestão</p>
              <p className="truncate text-sm font-semibold sm:text-base">{secao ?? titulo}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden size-9 items-center justify-center rounded-full border bg-muted text-primary sm:flex">
              <UserRound className="size-4" aria-hidden="true" />
            </div>
            <div className="hidden max-w-48 sm:block">
              <p className="truncate text-sm font-semibold">{nome}</p>
              <p className="text-xs text-muted-foreground">{titulo}</p>
            </div>
            <Button
              className="px-2.5 sm:px-3"
              onClick={sair}
              disabled={saindo}
              aria-busy={saindo}
              variant="ghost"
              size="sm"
            >
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
          <main
            id="conteudo-principal"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1520px] p-3 pb-10 sm:p-6 lg:p-8 xl:p-10 2xl:py-12"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
