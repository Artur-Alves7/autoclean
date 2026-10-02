import { LogoAutoClean } from "@/components/LogoAutoClean";
import { CarFront } from "lucide-react";
import type { ReactNode } from "react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="lc-workspace grid min-h-dvh lg:grid-cols-2">
      <section className="lc-sidebar hidden flex-col justify-between p-10 lg:flex xl:p-16">
        <div className="flex items-center justify-between">
          <p className="lc-brand text-white">
            LavaClean<span className="text-[var(--brand-cyan)]">.</span>
          </p>
          <span className="text-xs text-sidebar-foreground/70">Gestão do lava jato</span>
        </div>
        <div className="py-10">
          <LogoAutoClean className="mx-auto mb-10 aspect-square w-full max-w-72 rounded-2xl object-contain" />
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
            Cuidado em cada detalhe.
            <br />
            <span className="text-[var(--brand-cyan)]">Organização em cada etapa.</span>
          </h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-sidebar-foreground/75">
            Atendimentos, equipe e repasses em um só lugar. Mais clareza para a rotina do seu lava
            jato.
          </p>
        </div>
        <p className="flex items-center gap-2 border-t border-sidebar-border pt-6 text-xs text-sidebar-foreground/70">
          <CarFront className="size-4" aria-hidden="true" />
          Da chegada à entrega.
        </p>
      </section>
      <section className="flex min-h-dvh flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-4 lg:hidden">
            <LogoAutoClean className="size-20 rounded-xl object-contain" />
            <div>
              <p className="lc-brand">
                LavaClean<span className="text-primary">.</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Gestão do lava jato</p>
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
