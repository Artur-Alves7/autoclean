import { ClipboardList, Download, FileSpreadsheet, Wallet } from "lucide-react";
import { useState } from "react";

import { DialogoRelatorio } from "@/components/DialogoRelatorio";
import { Button } from "@/components/ui/button";
import type { Papel } from "@/lib/acesso";
import { dataLocalIso } from "@/lib/fechamento";
import {
  baixarCsv,
  dataDentroDoRelatorio,
  intervaloRelatorio,
  sufixoRelatorio,
  type FiltroRelatorio,
} from "@/lib/relatorios";
import { dividirRepasseCentavos, reaisParaCentavos, type StatusAtendimento } from "@/lib/regras";
import { db, formatarDataHora, formatarDinheiro } from "@/lib/supabase-db";

type TipoRelatorio = "atendimentos" | "repasses";
type FormaPagamento = "dinheiro" | "pix" | "debito" | "credito" | "outro";

type AtendimentoRelatorio = {
  status: StatusAtendimento;
  chegou_em: string;
  valor_final: number | null;
  nome_cliente_snapshot: string;
  veiculo_snapshot: string;
  categoria_veiculo_snapshot: string;
  servico_snapshot: string;
  observacoes: string | null;
  lavadores: { nome: string }[];
  pagamentos: { forma_pagamento: FormaPagamento; valor: number }[];
};

type AtendimentoRepasse = {
  entregue_em: string;
  nome_cliente_snapshot: string;
  veiculo_snapshot: string;
  servico_snapshot: string;
  valor_final: number;
  valor_empresa_snapshot: number;
  lavadores: { nome: string; ordem_rateio: number }[];
};

type RepasseLavador = {
  valor: number;
  atendimentos: { nome_cliente_snapshot: string; veiculo_snapshot: string } | null;
  fechamentos_diarios: { data_operacao: string; status: string } | null;
};

const NOMES_STATUS: Record<StatusAtendimento, string> = {
  aguardando: "Aguardando",
  em_lavagem: "Em lavagem",
  pronto_para_retirada: "Pronto para retirada",
  entregue: "Concluído",
  cancelado: "Cancelado",
};

const NOMES_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Débito",
  credito: "Crédito",
  outro: "Outro",
};

export function Relatorios({ perfilId, papel }: { perfilId: string; papel: Papel }) {
  const [relatorioAberto, setRelatorioAberto] = useState<TipoRelatorio | null>(null);
  const hoje = dataLocalIso();

  async function baixarRelatorioAtendimentos(filtro: FiltroRelatorio) {
    const intervalo = intervaloRelatorio(filtro);
    let consulta = db()
      .from("vw_painel_atendimentos")
      .select(
        "status, chegou_em, valor_final, nome_cliente_snapshot, veiculo_snapshot, categoria_veiculo_snapshot, servico_snapshot, observacoes, lavadores, pagamentos",
      );
    if (intervalo) {
      consulta = consulta.gte("chegou_em", intervalo.inicio).lt("chegou_em", intervalo.fim);
    }
    const { data, error } = await consulta.order("chegou_em");
    if (error) throw error;
    const itens = (data ?? []) as unknown as AtendimentoRelatorio[];
    if (!itens.length) throw new Error("Nenhum atendimento encontrado no período selecionado.");

    baixarCsv(
      `atendimentos-${sufixoRelatorio(filtro)}.csv`,
      [
        "Data e hora",
        "Cliente",
        "Veículo",
        "Categoria",
        "Serviço",
        "Status",
        "Valor final",
        "Lavadores",
        "Pagamentos",
        "Observações",
      ],
      itens.map((item) => [
        formatarDataHora(item.chegou_em),
        item.nome_cliente_snapshot,
        item.veiculo_snapshot,
        item.categoria_veiculo_snapshot,
        item.servico_snapshot,
        NOMES_STATUS[item.status],
        item.valor_final == null ? "Pendente" : formatarDinheiro(item.valor_final),
        item.lavadores.map((lavador) => lavador.nome).join(", ") || "Não vinculados",
        item.pagamentos.length
          ? item.pagamentos
              .map(
                (pagamento) =>
                  `${NOMES_PAGAMENTO[pagamento.forma_pagamento]}: ${formatarDinheiro(pagamento.valor)}`,
              )
              .join(" + ")
          : "Pendente",
        item.observacoes,
      ]),
    );
  }

  async function baixarRelatorioRepassesAdministrador(filtro: FiltroRelatorio) {
    const intervalo = intervaloRelatorio(filtro);
    let consulta = db()
      .from("vw_painel_atendimentos")
      .select(
        "entregue_em, nome_cliente_snapshot, veiculo_snapshot, servico_snapshot, valor_final, valor_empresa_snapshot, lavadores",
      )
      .eq("status", "entregue");
    if (intervalo) {
      consulta = consulta.gte("entregue_em", intervalo.inicio).lt("entregue_em", intervalo.fim);
    }
    const { data, error } = await consulta.order("entregue_em");
    if (error) throw error;
    const itens = (data ?? []) as unknown as AtendimentoRepasse[];
    if (!itens.length) throw new Error("Nenhum repasse encontrado no período selecionado.");

    const linhas = itens.flatMap((item) => {
      const valorCentavos = reaisParaCentavos(Number(item.valor_final));
      const empresaCentavos = reaisParaCentavos(Number(item.valor_empresa_snapshot));
      const lavadores = [...item.lavadores].sort((a, b) => a.ordem_rateio - b.ordem_rateio);
      const valoresLavadores = lavadores.length
        ? dividirRepasseCentavos(valorCentavos, empresaCentavos, lavadores.length)
        : [];
      return [
        [
          formatarDataHora(item.entregue_em),
          item.nome_cliente_snapshot,
          item.veiculo_snapshot,
          item.servico_snapshot,
          "Empresa",
          "Repasse",
          formatarDinheiro(empresaCentavos / 100),
        ],
        ...lavadores.map((lavador, indice) => [
          formatarDataHora(item.entregue_em),
          item.nome_cliente_snapshot,
          item.veiculo_snapshot,
          item.servico_snapshot,
          lavador.nome,
          "Repasse",
          formatarDinheiro(valoresLavadores[indice]! / 100),
        ]),
        ...(lavadores.length === 0 && valorCentavos > empresaCentavos
          ? [
              [
                formatarDataHora(item.entregue_em),
                item.nome_cliente_snapshot,
                item.veiculo_snapshot,
                item.servico_snapshot,
                "Equipe não vinculada",
                "Repasse pendente",
                formatarDinheiro((valorCentavos - empresaCentavos) / 100),
              ],
            ]
          : []),
      ];
    });
    baixarCsv(
      `repasses-${sufixoRelatorio(filtro)}.csv`,
      ["Data e hora", "Cliente", "Veículo", "Serviço", "Destinatário", "Tipo", "Valor"],
      linhas,
    );
  }

  async function baixarRelatorioRepassesLavador(filtro: FiltroRelatorio) {
    intervaloRelatorio(filtro);
    const { data, error } = await db()
      .from("itens_fechamento")
      .select(
        "valor, atendimentos(nome_cliente_snapshot, veiculo_snapshot), fechamentos_diarios(data_operacao, status)",
      )
      .eq("tipo_destinatario", "lavador")
      .eq("perfil_destinatario_id", perfilId)
      .order("criado_em", { ascending: false });
    if (error) throw error;
    const itens = ((data ?? []) as unknown as RepasseLavador[]).filter((item) =>
      dataDentroDoRelatorio(item.fechamentos_diarios?.data_operacao, filtro),
    );
    if (!itens.length) throw new Error("Nenhum repasse encontrado no período selecionado.");

    baixarCsv(
      `meus-repasses-${sufixoRelatorio(filtro)}.csv`,
      ["Data do fechamento", "Cliente", "Veículo", "Status", "Valor"],
      itens.map((item) => [
        item.fechamentos_diarios?.data_operacao ?? "Sem data",
        item.atendimentos?.nome_cliente_snapshot ?? "Atendimento",
        item.atendimentos?.veiculo_snapshot ?? "Veículo não informado",
        item.fechamentos_diarios?.status ?? "Sem status",
        formatarDinheiro(item.valor),
      ]),
    );
  }

  return (
    <section className="lc-page">
      <div className="lc-page-heading">
        <div>
          <span className="lc-eyebrow">Documentos</span>
          <h1 className="mt-2">Relatórios</h1>
          <p>Escolha o tipo e o período para baixar os dados em formato CSV.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="lc-panel flex flex-col">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Atendimentos</h2>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">
            Clientes, veículos, serviços, status, pagamentos e participantes.
          </p>
          <Button
            className="mt-5 w-full sm:w-fit"
            onClick={() => setRelatorioAberto("atendimentos")}
          >
            <Download aria-hidden="true" />
            Escolher período
          </Button>
        </article>

        <article className="lc-panel flex flex-col">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Wallet aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">
            {papel === "administrador" ? "Repasses" : "Meus repasses"}
          </h2>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">
            {papel === "administrador"
              ? "Distribuição dos valores entre a empresa e os lavadores."
              : "Valores vinculados ao seu perfil nos fechamentos confirmados."}
          </p>
          <Button className="mt-5 w-full sm:w-fit" onClick={() => setRelatorioAberto("repasses")}>
            <Download aria-hidden="true" />
            Escolher período
          </Button>
        </article>
      </div>

      <div className="lc-panel flex items-start gap-3 bg-muted/35">
        <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">Arquivo compatível com planilhas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Os relatórios são baixados em CSV e podem ser abertos no Excel, LibreOffice ou Google
            Planilhas.
          </p>
        </div>
      </div>

      <DialogoRelatorio
        aberto={relatorioAberto === "atendimentos"}
        dataPadrao={hoje}
        titulo="Relatório de atendimentos"
        aoFechar={() => setRelatorioAberto(null)}
        aoGerar={baixarRelatorioAtendimentos}
      />
      <DialogoRelatorio
        aberto={relatorioAberto === "repasses"}
        dataPadrao={hoje}
        titulo={papel === "administrador" ? "Relatório de repasses" : "Relatório dos meus repasses"}
        aoFechar={() => setRelatorioAberto(null)}
        aoGerar={
          papel === "administrador"
            ? baixarRelatorioRepassesAdministrador
            : baixarRelatorioRepassesLavador
        }
      />
    </section>
  );
}
