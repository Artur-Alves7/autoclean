import { CalendarDays, Download, History, LoaderCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EscopoRelatorio, FiltroRelatorio } from "@/lib/relatorios";

export function DialogoRelatorio({
  aberto,
  dataPadrao,
  titulo,
  aoFechar,
  aoGerar,
}: {
  aberto: boolean;
  dataPadrao: string;
  titulo: string;
  aoFechar: () => void;
  aoGerar: (filtro: FiltroRelatorio) => Promise<void>;
}) {
  const [escopo, setEscopo] = useState<EscopoRelatorio>("dia");
  const [data, setData] = useState(dataPadrao);
  const [inicio, setInicio] = useState(dataPadrao);
  const [fim, setFim] = useState(dataPadrao);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setEscopo("dia");
    setData(dataPadrao);
    setInicio(dataPadrao);
    setFim(dataPadrao);
    setErro(null);
  }, [aberto, dataPadrao]);

  async function gerar(evento: FormEvent) {
    evento.preventDefault();
    if (escopo === "periodo" && fim < inicio) {
      setErro("A data final não pode ser anterior à data inicial.");
      return;
    }
    setGerando(true);
    setErro(null);
    try {
      await aoGerar({ escopo, data, inicio, fim });
      aoFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  const opcoes: { valor: EscopoRelatorio; titulo: string; descricao: string }[] = [
    { valor: "dia", titulo: "Um dia", descricao: "Movimento de uma data específica" },
    { valor: "periodo", titulo: "Período", descricao: "Intervalo entre duas datas" },
    {
      valor: "historico",
      titulo: "Histórico completo",
      descricao: "Todos os registros disponíveis",
    },
  ];

  return (
    <Dialog open={aberto} onOpenChange={(estado) => !estado && !gerando && aoFechar()}>
      <DialogContent className="lc-workspace max-h-[calc(100dvh-1rem)] overflow-y-auto border-primary/20 bg-card p-0 shadow-2xl sm:max-h-[90dvh] sm:max-w-lg">
        <div className="border-b bg-muted/35 px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Download className="size-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle>{titulo}</DialogTitle>
              <DialogDescription className="mt-1.5 leading-relaxed">
                Escolha quais registros devem entrar no arquivo CSV.
              </DialogDescription>
            </div>
          </div>
        </div>
        <form className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6" onSubmit={gerar}>
          <fieldset className="grid gap-2">
            <legend className="lc-label mb-2">Período do relatório</legend>
            {opcoes.map((opcao) => (
              <label
                key={opcao.valor}
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="escopo-relatorio"
                  value={opcao.valor}
                  checked={escopo === opcao.valor}
                  onChange={() => {
                    setEscopo(opcao.valor);
                    setErro(null);
                  }}
                  className="mt-1 accent-primary"
                />
                <span>
                  <strong className="block text-sm">{opcao.titulo}</strong>
                  <span className="text-xs text-muted-foreground">{opcao.descricao}</span>
                </span>
                {opcao.valor === "historico" ? (
                  <History className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <CalendarDays
                    className="ml-auto size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </label>
            ))}
          </fieldset>

          {escopo === "dia" && (
            <label className="lc-label">
              Data do relatório
              <input
                aria-label="Data do relatório"
                type="date"
                className="lc-field"
                value={data}
                required
                onChange={(evento) => setData(evento.target.value)}
              />
            </label>
          )}
          {escopo === "periodo" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="lc-label">
                Data inicial
                <input
                  aria-label="Data inicial do relatório"
                  type="date"
                  className="lc-field"
                  value={inicio}
                  required
                  onChange={(evento) => setInicio(evento.target.value)}
                />
              </label>
              <label className="lc-label">
                Data final
                <input
                  aria-label="Data final do relatório"
                  type="date"
                  className="lc-field"
                  value={fim}
                  required
                  onChange={(evento) => setFim(evento.target.value)}
                />
              </label>
            </div>
          )}

          {erro && (
            <p role="alert" className="lc-message">
              {erro}
            </p>
          )}
          <DialogFooter className="gap-2 border-t pt-5 [&>button]:w-full sm:space-x-0 sm:[&>button]:w-auto">
            <Button type="button" variant="outline" disabled={gerando} onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={gerando} aria-busy={gerando}>
              {gerando ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {gerando ? "Gerando..." : "Gerar relatório"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
