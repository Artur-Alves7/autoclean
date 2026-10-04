import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AcessoNegado, carregarAcesso, destinoDoPapel } from "@/lib/acesso";
import { origemDoRetornoAuth } from "@/lib/auth";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

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
      if (acesso?.primeiroAcessoPendente) {
        navigate({ to: "/definir-senha", search: { origem: "convite" }, replace: true });
        return;
      }
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
    let ativo = true;
    const origem = origemDoRetornoAuth(window.location.href);
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") {
        navigate({ to: "/definir-senha", search: { origem: "recuperacao" }, replace: true });
      }
    });
    void supabase.auth.getSession().then(({ data: sessao }) => {
      if (!ativo) return;
      if (origem && sessao.session) {
        navigate({ to: "/definir-senha", search: { origem }, replace: true });
      } else {
        void encaminhar();
      }
    });
    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
    // O redirecionamento só deve ser inicializado uma vez ao montar a página.
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
    <AuthLayout>
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
          <span className="flex items-center justify-between gap-4">
            Senha
            <Link
              to="/recuperar-senha"
              className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
            >
              Esqueci minha senha
            </Link>
          </span>
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
        <ShieldCheck className="size-4" aria-hidden="true" /> Acesso exclusivo para a equipe
        autorizada
      </p>
    </AuthLayout>
  );
}
