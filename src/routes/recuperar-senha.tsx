import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/recuperar-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recuperar senha — LavaClean" },
      { name: "description", content: "Solicite um link seguro para redefinir sua senha." },
    ],
  }),
  component: RecuperarSenha,
});

function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function solicitar(ev: FormEvent) {
    ev.preventDefault();
    setCarregando(true);
    setErro(null);
    const redirectTo = new URL(
      "/definir-senha?origem=recuperacao",
      window.location.origin,
    ).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setCarregando(false);
    if (error) {
      setErro(
        /rate limit|too many/i.test(error.message)
          ? "Muitas tentativas. Aguarde alguns instantes antes de tentar novamente."
          : "Não foi possível solicitar a recuperação agora. Tente novamente.",
      );
      return;
    }
    setEnviado(true);
  }

  return (
    <AuthLayout>
      {enviado ? (
        <div aria-live="polite">
          <MailCheck className="size-10 text-primary" aria-hidden="true" />
          <p className="lc-eyebrow mt-6">Solicitação recebida</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Confira seu e-mail</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Se existir uma conta para esse endereço, você receberá um link para definir uma nova
            senha. Verifique também a pasta de spam.
          </p>
          <Button asChild variant="outline" size="lg" className="mt-8 w-full">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Voltar para o login
            </Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={solicitar} className="space-y-6">
          <div className="mb-8">
            <p className="lc-eyebrow">Recuperação de acesso</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Esqueceu sua senha?</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Informe o e-mail usado no LavaClean. Enviaremos as instruções para você recuperar o
              acesso.
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
              autoFocus
            />
          </label>
          <Button
            type="submit"
            disabled={carregando}
            aria-busy={carregando}
            size="lg"
            className="w-full"
          >
            {carregando ? "Enviando..." : "Enviar link de recuperação"}
            {carregando && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          </Button>
          <Link
            to="/"
            className="flex items-center justify-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Voltar para o login
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
