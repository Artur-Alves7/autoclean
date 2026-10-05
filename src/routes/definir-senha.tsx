import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { carregarAcesso, destinoDoPapel } from "@/lib/acesso";
import { validarNovaSenha, type OrigemDefinicaoSenha } from "@/lib/auth";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

type BuscaDefinirSenha = { origem?: OrigemDefinicaoSenha };

export const Route = createFileRoute("/definir-senha")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): BuscaDefinirSenha =>
    s["origem"] === "convite" || s["origem"] === "recuperacao" ? { origem: s["origem"] } : {},
  head: () => ({
    meta: [
      { title: "Definir senha — Auto Clean" },
      { name: "description", content: "Defina com segurança sua senha de acesso ao Auto Clean." },
    ],
  }),
  component: DefinirSenha,
});

function DefinirSenha() {
  const navigate = useNavigate();
  const { origem } = Route.useSearch();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [verificando, setVerificando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sessaoValida, setSessaoValida] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!ativo) return;
      setSessaoValida(Boolean(data.session) && !error);
      setVerificando(false);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const erroValidacao = validarNovaSenha(senha, confirmacao);
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({
      password: senha,
      data: { primeiro_acesso_pendente: false },
    });
    setSalvando(false);
    if (error) {
      setErro(
        /same password/i.test(error.message)
          ? "Escolha uma senha diferente da atual."
          : "Não foi possível definir a senha. Solicite um novo link e tente novamente.",
      );
      return;
    }
    setConcluido(true);
  }

  async function continuar() {
    const acesso = await carregarAcesso();
    if (acesso) navigate({ to: destinoDoPapel(acesso.papel), replace: true });
    else navigate({ to: "/", replace: true });
  }

  return (
    <AuthLayout>
      {verificando ? (
        <div
          className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Validando seu link...
        </div>
      ) : concluido ? (
        <div aria-live="polite">
          <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
          <p className="lc-eyebrow mt-6">Senha definida</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Seu acesso está pronto</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Sua nova senha foi salva com segurança. Você já pode continuar para o Auto Clean.
          </p>
          <Button type="button" size="lg" className="mt-8 w-full" onClick={() => void continuar()}>
            Continuar
          </Button>
        </div>
      ) : !sessaoValida ? (
        <div>
          <p className="lc-eyebrow">Link inválido ou expirado</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Solicite um novo acesso</h1>
          <p role="alert" className="mt-4 text-sm leading-6 text-muted-foreground">
            Este link não criou uma sessão válida. Convites devem ser reenviados pelo administrador;
            para uma senha esquecida, solicite outra recuperação.
          </p>
          <div className="mt-8 grid gap-3">
            <Button asChild size="lg">
              <Link to="/recuperar-senha">Recuperar senha</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/">Voltar para o login</Link>
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={salvar} className="space-y-6">
          <div className="mb-8">
            <p className="lc-eyebrow">
              {origem === "convite" ? "Primeiro acesso" : "Recuperação de acesso"}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Defina sua senha</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Use pelo menos 8 caracteres. Evite senhas reutilizadas em outros serviços.
            </p>
          </div>
          {erro && (
            <div role="alert" className="lc-message">
              {erro}
            </div>
          )}
          <label className="lc-label">
            <span>Nova senha</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="lc-field"
              disabled={salvando}
              autoFocus
            />
          </label>
          <label className="lc-label">
            <span>Confirmar nova senha</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              className="lc-field"
              disabled={salvando}
            />
          </label>
          <Button
            type="submit"
            disabled={salvando}
            aria-busy={salvando}
            size="lg"
            className="w-full"
          >
            {salvando ? "Salvando..." : "Salvar nova senha"}
            {salvando && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
