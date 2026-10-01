import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AcessoNegado, carregarAcesso, destinoDoPapel } from "@/lib/acesso";

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ msg: typeof s.msg === "string" ? s.msg : undefined }),
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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setErro(traduzir(error.message));
      setCarregando(false);
      return;
    }
    await encaminhar();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">LavaClean</h1>
          <p className="mt-1 text-sm text-muted-foreground">Entre com seu e-mail e senha</p>
        </div>
        {erro && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {erro}
          </div>
        )}
        <label className="block space-y-1 text-sm font-medium text-foreground">
          <span>E-mail</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2" disabled={carregando} />
        </label>
        <label className="block space-y-1 text-sm font-medium text-foreground">
          <span>Senha</span>
          <input type="password" required autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2" disabled={carregando} />
        </label>
        <button type="submit" disabled={carregando}
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {carregando ? "Carregando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
