import { LogoAutoClean } from "@/components/LogoAutoClean";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AcessoNegado, carregarAcesso, destinoDoPapel } from "@/lib/acesso";
import { ArrowRight, CarFront, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { msg?: string } =>
    typeof s["msg"] === "string" ? { msg: s["msg"] } : {},
  head: () => ({
    meta: [
      { title: "Entrar — LavaClean" },
      { name: "description", content: "Acesse o sistema LavaClean com seu e-mail e senha." },
      { property: "og:title", content: "Entrar — LavaClean" },
      { property: "og:description", content: "Acesse o sistema LavaClean com seu e-mail e senha." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

function traduzir(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Seu e-mail ainda não foi confirmado.";
  if (/rate limit|too many/i.test(msg)) return "Muitas tentativas. Aguarde alguns instantes.";
  if (/fetch|network/i.test(msg)) return "Falha de conexão. Verifique sua internet.";
  return "Não foi possível entrar. Tente novamente.";
}

function Login() {
  const navigate = useNavigate();
  const { msg } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(msg ?? null);

  async function encaminhar() {
    try {
      const acesso = await carregarAcesso();
      if (acesso) {
        navigate({ to: destinoDoPapel(acesso.papel), replace: true });
        return;
      }
    } catch (e) {
      if (e instanceof AcessoNegado) await supabase.auth.signOut();
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    }
    setCarregando(false);
  }

  useEffect(() => {
    encaminhar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function entrar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    if (error) {
      setErro(traduzir(error.message));
      setCarregando(false);
      return;
    }
    await encaminhar();
  }

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
          <form onSubmit={entrar} className="space-y-6">
            <div className="mb-8">
              <p className="lc-eyebrow">Bem-vindo ao LavaClean</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight">Acesse seu espaço</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Entre com seu e-mail e senha para continuar.
              </p>
            </div>
            {erro && (
              <div role="alert" className="lc-message">
                {erro}
              </div>
            )}
            <label className="lc-label">
              <span>E-mail</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="lc-field"
                disabled={carregando}
              />
            </label>
            <label className="lc-label">
              <span>Senha</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="lc-field"
                disabled={carregando}
              />
            </label>
            <Button
              type="submit"
              disabled={carregando}
              aria-busy={carregando}
              size="lg"
              className="w-full"
            >
              {carregando ? "Carregando..." : "Entrar"}
              {carregando ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight aria-hidden="true" />
              )}
            </Button>
          </form>
          <p className="mt-8 flex items-center justify-center gap-2 border-t pt-6 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Acesso exclusivo para a equipe autorizada
          </p>
        </div>
      </section>
    </main>
  );
}
