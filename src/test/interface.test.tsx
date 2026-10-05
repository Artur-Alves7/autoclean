import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilaAtendimentos } from "@/components/Atendimentos";
import { ClientesVeiculos } from "@/components/ClientesVeiculos";
import { Fechamentos } from "@/components/Fechamentos";
import { LogoAutoClean } from "@/components/LogoAutoClean";
import { PainelSistema } from "@/components/PainelSistema";
import { StatusBadge } from "@/components/StatusBadge";
import { dataLocalIso } from "@/lib/fechamento";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ error: null }),
  from: vi.fn((tabela: string) => {
    if (tabela !== "clientes") throw new Error(`Tabela inesperada no teste: ${tabela}`);
    return {
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [
              {
                id: "cliente-z",
                nome_completo: "Zilda de teste",
                telefone: "85999999999",
                observacoes: null,
                ativo: true,
              },
              {
                id: "cliente-a",
                nome_completo: "Alice de teste",
                telefone: "85888888888",
                observacoes: null,
                ativo: true,
              },
            ],
            error: null,
          }),
      }),
    };
  }),
  navegar: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navegar }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));
vi.mock("@/lib/supabase-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase-db")>()),
  db: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

const categoriaId = "d5319fa3-36ef-4f7d-a5ae-4f5399ea0e18";
const filaTeste = [
  {
    id: "atendimento-teste",
    status: "pronto_para_retirada",
    chegou_em: "2026-10-02T08:30:00-03:00",
    agendado_para: null as string | null,
    valor_final: 100,
    cliente_id: "cliente-teste",
    veiculo_id: "veiculo-teste",
    servico_id: "servico-teste",
    observacoes: null,
    nome_cliente_snapshot: "Cliente de teste",
    veiculo_snapshot: "Veículo de teste",
    categoria_veiculo_snapshot: "Categoria de teste",
    servico_snapshot: "Serviço de teste",
    lavadores: [{ perfil_id: "lavador-teste", nome: "Lavador de teste", ordem_rateio: 1 }],
    pagamentos: [] as {
      forma_pagamento: "dinheiro" | "pix" | "debito" | "credito" | "outro";
      valor: number;
    }[],
  },
];

function clienteDeTeste(fila = filaTeste) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["fila-atendimentos", dataLocalIso()], fila);
  qc.setQueryData(["auxiliares-atendimento"], {
    categorias: [{ id: categoriaId, nome: "Categoria de teste" }],
    servicos: [{ id: "servico-teste", nome: "Serviço de teste" }],
    lavadores: [{ id: "lavador-teste", nome: "Lavador de teste" }],
  });
  qc.setQueryData(["meus-repasses", "lavador-teste"], []);
  return qc;
}

function renderFila(
  fila = filaTeste,
  papel: "administrador" | "lavador" = "lavador",
  preparar?: (qc: QueryClient) => void,
) {
  const qc = clienteDeTeste(fila);
  preparar?.(qc);
  return render(
    <QueryClientProvider client={qc}>
      <FilaAtendimentos perfilId="lavador-teste" papel={papel} />
    </QueryClientProvider>,
  );
}

function renderFechamentos(
  papel: "administrador" | "lavador",
  opcoes: {
    atendimentos?: unknown[];
    fechamento?: { id: string; status: string; confirmado_em: string | null } | null;
    ajustes?: { id: string; valor: number }[];
    historico?: unknown[];
    itensFechamento?: unknown[];
  } = {},
) {
  const qc = clienteDeTeste([]);
  const hoje = dataLocalIso();
  qc.setQueryData(
    ["atendimentos-fechamento", hoje],
    opcoes.atendimentos ?? [
      {
        id: "atendimento-entregue-teste",
        entregue_em: `${hoje}T12:00:00-03:00`,
        nome_cliente_snapshot: "Cliente de teste",
        veiculo_snapshot: "Veículo de teste",
        valor_final: 100,
        valor_empresa_snapshot: 40,
        total_pago: 100,
        lavadores: [{ perfil_id: "lavador-teste", nome: "Lavador de teste", ordem_rateio: 1 }],
      },
    ],
  );
  qc.setQueryData(["fechamento-diario", hoje], opcoes.fechamento ?? null);
  if (opcoes.fechamento?.id) {
    qc.setQueryData(["itens-fechamento", opcoes.fechamento.id], opcoes.itensFechamento ?? []);
  }
  qc.setQueryData(["ajustes-repasse-pendentes", hoje], opcoes.ajustes ?? []);
  qc.setQueryData(
    ["historico-atendimentos", hoje],
    opcoes.historico ??
      opcoes.atendimentos ?? [
        {
          id: "atendimento-entregue-teste",
          entregue_em: `${hoje}T12:00:00-03:00`,
          nome_cliente_snapshot: "Cliente de teste",
          veiculo_snapshot: "Veículo de teste",
          servico_snapshot: "Serviço de teste",
          valor_final: 100,
          valor_empresa_snapshot: 40,
          total_pago: 100,
          lavadores: [{ perfil_id: "lavador-teste", nome: "Lavador de teste", ordem_rateio: 1 }],
        },
      ],
  );
  return render(
    <QueryClientProvider client={qc}>
      <Fechamentos perfilId="lavador-teste" papel={papel} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("interface operacional", () => {
  it("preserva uma margem interna para a logo não ser cortada nos cantos", () => {
    render(<LogoAutoClean className="rounded-xl" />);
    const logo = screen.getByAltText("Auto Clean");
    expect(logo.parentElement).toHaveClass("overflow-hidden", "p-[6%]", "rounded-xl");
  });

  it("mantém rótulos textuais para todos os status, além das cores", () => {
    const statuses = ["aguardando", "em_lavagem", "pronto_para_retirada", "entregue", "cancelado"];
    render(
      <>
        {statuses.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </>,
    );
    for (const nome of [
      "Aguardando",
      "Em lavagem",
      "Pronto para retirada",
      "Concluído",
      "Cancelado",
    ]) {
      expect(screen.getByText(nome)).toBeInTheDocument();
    }
  });

  it("mantém a fila vazia e o botão de chegada funcionais", () => {
    renderFila([]);
    expect(screen.getByText("Nenhum atendimento neste dia.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Novo atendimento" }));
    expect(screen.getByRole("form", { name: "Registrar chegada" })).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar cliente por nome, telefone ou placa")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("organiza a central verticalmente nas quatro etapas", () => {
    renderFila();
    for (const etapa of ["Aguardando", "Em lavagem", "Pronto para retirada", "Concluídos"]) {
      expect(screen.getByRole("heading", { name: etapa })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Selecionar data da operação")).not.toHaveAttribute("max");
    expect(screen.getByRole("button", { name: "Próximo dia" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar relatório" })).toBeEnabled();
  });

  it("oferece relatório por dia, período ou histórico completo", () => {
    renderFila();
    fireEvent.click(screen.getByRole("button", { name: "Baixar relatório" }));

    expect(screen.getByRole("dialog", { name: "Relatório de atendimentos" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Um dia/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Período/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Histórico completo/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Período/ }));
    expect(screen.getByLabelText("Data inicial do relatório")).toBeInTheDocument();
    expect(screen.getByLabelText("Data final do relatório")).toBeInTheDocument();
  });

  it("diferencia agendamentos futuros na fila", () => {
    renderFila([
      {
        ...filaTeste[0]!,
        status: "aguardando",
        chegou_em: "2099-10-05T14:30:00-03:00",
        agendado_para: "2099-10-05T14:30:00-03:00",
      },
    ]);

    expect(screen.getByText("Agendamento")).toBeInTheDocument();
    expect(screen.getByText("Agendado para")).toBeInTheDocument();
  });

  it("permite escolher horários futuros e passados no novo atendimento", () => {
    renderFila([]);
    fireEvent.click(screen.getByRole("button", { name: "Novo atendimento" }));
    fireEvent.click(screen.getByLabelText("Escolher data e horário"));

    const campo = screen.getByLabelText("Data e horário do atendimento");
    expect(campo).not.toHaveAttribute("min");
    expect(campo).not.toHaveAttribute("max");

    fireEvent.change(campo, { target: { value: "2099-10-05T14:30" } });
    expect(screen.getByRole("button", { name: "Criar agendamento" })).toBeInTheDocument();
    expect(screen.getByText("Será salvo como agendamento futuro.")).toBeInTheDocument();

    fireEvent.change(campo, { target: { value: "2020-01-02T08:15" } });
    expect(
      screen.getByRole("button", { name: "Registrar atendimento retroativo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Será registrado no histórico como atendimento retroativo."),
    ).toBeInTheDocument();
  });

  it("carrega os clientes cadastrados em ordem alfabética sem exigir busca", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ClientesVeiculos papel="lavador" />
      </QueryClientProvider>,
    );

    const alice = await screen.findByText("Alice de teste");
    const zilda = screen.getByText("Zilda de teste");
    expect(alice.compareDocumentPosition(zilda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("2 cliente(s)")).toBeInTheDocument();
  });

  it("adiciona outro veículo a um cliente já cadastrado", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    qc.setQueryData(
      ["clientes", ""],
      [
        {
          id: "cliente-existente",
          nome_completo: "Cliente existente",
          telefone: "85999999999",
          observacoes: null,
          ativo: true,
        },
      ],
    );
    qc.setQueryData(["cliente-detalhes", "cliente-existente"], {
      veiculos: [],
      atendimentos: [],
    });
    qc.setQueryData(
      ["categorias-veiculo-ativas"],
      [{ id: categoriaId, nome: "Categoria de teste" }],
    );
    render(
      <QueryClientProvider client={qc}>
        <ClientesVeiculos papel="lavador" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Cliente existente/ }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar veículo" }));
    const dialogo = screen.getByRole("dialog", { name: "Adicionar veículo" });
    fireEvent.change(within(dialogo).getByLabelText("Categoria"), {
      target: { value: categoriaId },
    });
    fireEvent.change(within(dialogo).getByLabelText("Marca"), {
      target: { value: "Fiat" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Modelo"), {
      target: { value: "Argo" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Placa (opcional)"), {
      target: { value: "abc-1d23" },
    });
    expect(within(dialogo).getByLabelText("Placa (opcional)")).toHaveValue("ABC-1D23");
    fireEvent.change(within(dialogo).getByLabelText("Cor (opcional)"), {
      target: { value: "Prata" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar veículo" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("rpc_adicionar_veiculo_cliente", {
        p_cliente_id: "cliente-existente",
        p_categoria_veiculo_id: categoriaId,
        p_marca: "Fiat",
        p_modelo: "Argo",
        p_placa: "ABC-1D23",
        p_cor: "Prata",
      }),
    );
    expect(mocks.rpc.mock.calls[0]![1]).not.toHaveProperty("placa_normalizada");
  });

  it("preserva cadastro, participantes e preço pendente no payload", async () => {
    renderFila([]);
    fireEvent.click(screen.getByRole("button", { name: "Novo atendimento" }));
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar cliente/ }));
    fireEvent.change(screen.getByLabelText("Nome", { exact: true }), {
      target: { value: "Cliente de teste" },
    });
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "85999999999" } });
    expect(screen.getByLabelText("Telefone")).toHaveValue("(85) 99999-9999");
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: categoriaId } });
    fireEvent.change(screen.getByLabelText("Marca", { exact: true }), {
      target: { value: "Marca teste" },
    });
    fireEvent.change(screen.getByLabelText("Modelo", { exact: true }), {
      target: { value: "Modelo teste" },
    });
    fireEvent.change(screen.getByLabelText("Serviço", { exact: true }), {
      target: { value: "servico-teste" },
    });
    fireEvent.click(screen.getByLabelText("Lavador de teste", { exact: true }));
    expect(screen.getByLabelText("Informar valor depois")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Registrar chegada" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "rpc_criar_atendimento",
        expect.objectContaining({
          p_cliente: { nome_completo: "Cliente de teste", telefone: "(85) 99999-9999" },
          p_lavadores: ["lavador-teste"],
          p_valor_final: null,
          p_servico_id: "servico-teste",
        }),
      ),
    );
    expect(mocks.rpc.mock.calls[0]![1].p_veiculo).toMatchObject({ placa: null });
    expect(mocks.rpc.mock.calls[0]![1].p_veiculo).not.toHaveProperty("placa_normalizada");
  });

  it("reutiliza um entre múltiplos veículos e aceita valor informado", async () => {
    renderFila([], "lavador", (qc) => {
      qc.setQueryData(
        ["busca-clientes", "Cliente existente"],
        [{ id: "cliente-existente", nome_completo: "Cliente existente", telefone: "85988887777" }],
      );
      qc.setQueryData(
        ["veiculos-cliente", "cliente-existente"],
        [
          {
            id: "moto-sem-placa",
            marca: "Honda",
            modelo: "CG 160",
            placa: null,
            cor: "Vermelha",
            categorias_veiculo: { nome: "Moto" },
          },
          {
            id: "carro-com-placa",
            marca: "Fiat",
            modelo: "Argo",
            placa: "ABC-1D23",
            cor: "Prata",
            categorias_veiculo: { nome: "Carro" },
          },
        ],
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Novo atendimento" }));
    fireEvent.change(screen.getByLabelText("Buscar cliente por nome, telefone ou placa"), {
      target: { value: "Cliente existente" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Cliente existente · \(85\) 98888-7777/ }),
    );
    expect(await screen.findByLabelText(/Honda CG 160 · Sem placa/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Fiat Argo · ABC-1D23/));
    fireEvent.change(screen.getByLabelText("Serviço", { exact: true }), {
      target: { value: "servico-teste" },
    });
    fireEvent.click(screen.getByLabelText("Lavador de teste", { exact: true }));
    fireEvent.click(screen.getByLabelText("Informar valor depois"));
    fireEvent.change(screen.getByLabelText("Valor final (R$)"), { target: { value: "89,90" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar chegada" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "rpc_criar_atendimento",
        expect.objectContaining({
          p_cliente_id: "cliente-existente",
          p_cliente: null,
          p_veiculo_id: "carro-com-placa",
          p_veiculo: null,
          p_valor_final: 89.9,
        }),
      ),
    );
  });

  it("mostra a primeira mensagem de validação em linguagem simples", async () => {
    renderFila([]);
    fireEvent.click(screen.getByRole("button", { name: "Novo atendimento" }));
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar cliente/ }));
    fireEvent.change(screen.getByLabelText("Serviço", { exact: true }), {
      target: { value: "servico-teste" },
    });
    fireEvent.click(screen.getByLabelText("Lavador de teste", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar chegada" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Informe o nome do cliente.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("invalid_type");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("bloqueia dois envios rápidos do mesmo atendimento", async () => {
    let concluir!: (resultado: { error: null }) => void;
    mocks.rpc.mockReturnValueOnce(
      new Promise<{ error: null }>((resolve) => {
        concluir = resolve;
      }),
    );
    renderFila([]);
    fireEvent.click(screen.getByRole("button", { name: "Novo atendimento" }));
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar cliente/ }));
    fireEvent.change(screen.getByLabelText("Nome", { exact: true }), {
      target: { value: "Cliente de teste" },
    });
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "85999999999" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: categoriaId } });
    fireEvent.change(screen.getByLabelText("Marca", { exact: true }), {
      target: { value: "Marca teste" },
    });
    fireEvent.change(screen.getByLabelText("Modelo", { exact: true }), {
      target: { value: "Modelo teste" },
    });
    fireEvent.change(screen.getByLabelText("Serviço", { exact: true }), {
      target: { value: "servico-teste" },
    });
    fireEvent.click(screen.getByLabelText("Lavador de teste", { exact: true }));
    const formulario = screen.getByRole("form", { name: "Registrar chegada" });
    fireEvent.submit(formulario);
    fireEvent.submit(formulario);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    concluir({ error: null });
  });

  it("exige motivo suficiente antes de cancelar", async () => {
    renderFila();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("motivo do cancelamento");
    expect(mocks.rpc).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "Cliente desistiu do serviço" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "rpc_avancar_atendimento",
        expect.objectContaining({
          p_novo_status: "cancelado",
          p_motivo: "Cliente desistiu do serviço",
        }),
      ),
    );
  });

  it.each([
    ["lavador", false],
    ["administrador", true],
  ] as const)("restringe a edição completa do atendimento para %s", (papel, podeEditar) => {
    renderFila(filaTeste, papel);
    expect(screen.getByRole("button", { name: "Novo atendimento" })).toBeInTheDocument();
    if (podeEditar) {
      expect(screen.getByRole("button", { name: "Editar informações" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: "Editar informações" })).not.toBeInTheDocument();
    }
  });

  it("mostra a forma de pagamento no atendimento concluído", () => {
    renderFila([
      {
        ...filaTeste[0]!,
        status: "entregue",
        pagamentos: [{ forma_pagamento: "pix", valor: 100 }],
      },
    ]);

    expect(screen.getByText("Pagamento")).toBeInTheDocument();
    expect(screen.getByText("PIX")).toBeInTheDocument();
  });

  it("oferece edição administrativa em todas as etapas", () => {
    renderFila(
      ["aguardando", "em_lavagem", "pronto_para_retirada", "entregue"].map((status, indice) => ({
        ...filaTeste[0]!,
        id: `atendimento-${indice}`,
        status,
      })),
      "administrador",
    );

    expect(screen.getAllByRole("button", { name: "Editar informações" })).toHaveLength(4);
  });

  it("salva a edição administrativa com auditoria e sem pagamento antecipado", async () => {
    renderFila(filaTeste, "administrador", (qc) => {
      qc.setQueryData(["opcoes-edicao-atendimento"], {
        clientes: [
          { id: "cliente-teste", nome_completo: "Cliente de teste", telefone: "85999999999" },
        ],
        servicos: [{ id: "servico-teste", nome: "Serviço de teste" }],
        lavadores: [{ id: "lavador-teste", nome: "Lavador de teste" }],
      });
      qc.setQueryData(
        ["veiculos-edicao-atendimento", "cliente-teste"],
        [
          {
            id: "veiculo-teste",
            marca: "Marca teste",
            modelo: "Modelo teste",
            placa: "ABC-1D23",
            cor: "Azul",
            categorias_veiculo: { nome: "Categoria de teste" },
          },
        ],
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Editar informações" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar informações do atendimento" });
    fireEvent.change(within(dialogo).getByLabelText("Valor final (R$) (opcional)"), {
      target: { value: "80,50" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Motivo da edição"), {
      target: { value: "Correção solicitada pelo administrador" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar atendimento" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "rpc_editar_atendimento",
        expect.objectContaining({
          p_atendimento_id: "atendimento-teste",
          p_cliente_id: "cliente-teste",
          p_veiculo_id: "veiculo-teste",
          p_servico_id: "servico-teste",
          p_lavadores: ["lavador-teste"],
          p_valor_final: 80.5,
          p_pagamentos: [],
          p_motivo: "Correção solicitada pelo administrador",
        }),
      ),
    );
  });

  it("abre diálogo de entrega com campos rotulados e restaura foco ao fechar", async () => {
    renderFila();
    const acao = screen.getByRole("button", { name: "Registrar entrega" });
    acao.focus();
    fireEvent.click(acao);
    const dialog = screen.getByRole("dialog", { name: "Registrar entrega" });
    expect(within(dialog).getByLabelText("Forma 1")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Valor (R$)", { exact: true })).toBeInTheDocument();
    expect(within(dialog).getByAltText("QR Code PIX do Auto Clean")).toBeInTheDocument();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(acao);
  });

  it("mantém bloqueio de pagamento divergente e RPC da entrega correta", async () => {
    renderFila();
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    fireEvent.change(screen.getByLabelText("Valor (R$)", { exact: true }), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("exatamente igual");
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Valor (R$)", { exact: true }), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "rpc_avancar_atendimento",
        expect.objectContaining({
          p_novo_status: "entregue",
          p_valor_final: 100,
          p_pagamentos: [{ forma_pagamento: "pix", valor_centavos: 10000 }],
        }),
      ),
    );
  });

  it("registra pagamento dividido com centavos e mostra a conferência", async () => {
    renderFila([{ ...filaTeste[0]!, valor_final: 100.03 }]);
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    fireEvent.change(screen.getByLabelText("Valor (R$)", { exact: true }), {
      target: { value: "60,01" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Dividir pagamento/ }));
    const valores = screen.getAllByLabelText("Valor (R$)", { exact: true });
    fireEvent.change(valores[1]!, { target: { value: "40,02" } });
    fireEvent.change(screen.getByLabelText("Forma 2"), { target: { value: "dinheiro" } });

    expect(screen.getByText(/Total informado: R\$ 100,03.*Valor conferido/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("rpc_avancar_atendimento", {
        p_atendimento_id: "atendimento-teste",
        p_novo_status: "entregue",
        p_motivo: null,
        p_valor_final: 100.03,
        p_pagamentos: [
          { forma_pagamento: "pix", valor_centavos: 6001 },
          { forma_pagamento: "dinheiro", valor_centavos: 4002 },
        ],
      }),
    );
  });

  it("não substitui pagamentos ao avançar uma etapa sem entrega", async () => {
    renderFila([{ ...filaTeste[0]!, status: "em_lavagem", valor_final: 100 }]);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como pronto" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "rpc_avancar_atendimento",
        expect.objectContaining({
          p_novo_status: "pronto_para_retirada",
          p_pagamentos: null,
        }),
      ),
    );
  });

  it("separa o movimento diário da preparação do fechamento", () => {
    renderFechamentos("administrador");
    const movimento = screen.getByRole("tab", { name: "Movimento do dia" });
    const fechamento = screen.getByRole("tab", { name: "Preparar fechamento" });

    expect(movimento).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Como o valor foi distribuído")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar relatório" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Confirmar fechamento" })).not.toBeInTheDocument();

    fireEvent.click(fechamento);
    expect(fechamento).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Valores disponíveis para fechamento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar fechamento" })).toBeInTheDocument();
  });

  it("bloqueia dois cliques rápidos ao registrar a entrega", async () => {
    let concluir!: (resultado: { error: null }) => void;
    mocks.rpc.mockReturnValueOnce(
      new Promise<{ error: null }>((resolve) => {
        concluir = resolve;
      }),
    );
    renderFila();
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    const confirmar = screen.getByRole("button", { name: "Confirmar" });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    concluir({ error: null });
  });

  it.each([
    ["administrador", true],
    ["lavador", false],
  ] as const)("restringe a correção financeira entregue para %s", (papel, podeCorrigir) => {
    renderFechamentos(papel);
    if (podeCorrigir) {
      fireEvent.click(screen.getByRole("tab", { name: "Preparar fechamento" }));
      expect(screen.getByRole("button", { name: "Corrigir" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: "Corrigir" })).not.toBeInTheDocument();
    }
  });

  it("impede correção administrativa com valor final zero", async () => {
    renderFechamentos("administrador");
    fireEvent.click(screen.getByRole("tab", { name: "Preparar fechamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Corrigir" }));
    const dialogo = screen.getByRole("dialog", { name: "Corrigir atendimento entregue" });
    fireEvent.change(within(dialogo).getByLabelText("Novo valor final (R$)"), {
      target: { value: "0" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Motivo da correção"), {
      target: { value: "Ajuste financeiro de teste" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar correção" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("maior que zero");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("corrige atendimento em um diálogo visual com campos rotulados", async () => {
    renderFechamentos("administrador");
    fireEvent.click(screen.getByRole("tab", { name: "Preparar fechamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Corrigir" }));

    const dialogo = screen.getByRole("dialog", { name: "Corrigir atendimento entregue" });
    expect(within(dialogo).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Novo valor final (R$)"), {
      target: { value: "105,50" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Forma de pagamento"), {
      target: { value: "dinheiro" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Motivo da correção"), {
      target: { value: "Valor corrigido após conferência" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar correção" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("rpc_corrigir_atendimento_entregue", {
        p_atendimento_id: "atendimento-entregue-teste",
        p_valor_final: 105.5,
        p_pagamentos: [{ forma_pagamento: "dinheiro", valor_centavos: 10550 }],
        p_motivo: "Valor corrigido após conferência",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("abre um fechamento confirmado sem tentar criá-lo novamente", () => {
    renderFechamentos("administrador", {
      fechamento: {
        id: "fechamento-teste",
        status: "confirmado",
        confirmado_em: "2026-10-02T18:00:00-03:00",
      },
      itensFechamento: [
        {
          id: "item-empresa",
          atendimento_id: "atendimento-entregue-teste",
          tipo_destinatario: "empresa",
          tipo_lancamento: "repasse",
          valor: 40,
          atendimentos: {
            nome_cliente_snapshot: "Cliente de teste",
            veiculo_snapshot: "Veículo de teste",
            servico_snapshot: "Serviço de teste",
          },
          destinatario: null,
        },
        {
          id: "item-lavador",
          atendimento_id: "atendimento-entregue-teste",
          tipo_destinatario: "lavador",
          tipo_lancamento: "repasse",
          valor: 60,
          atendimentos: {
            nome_cliente_snapshot: "Cliente de teste",
            veiculo_snapshot: "Veículo de teste",
            servico_snapshot: "Serviço de teste",
          },
          destinatario: { nome_completo: "Lavador de teste" },
        },
      ],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Preparar fechamento" }));
    expect(screen.getByRole("status")).toHaveTextContent("já confirmado");
    fireEvent.click(screen.getByRole("button", { name: "Abrir fechamento" }));
    const dialogo = screen.getByRole("dialog", { name: /Fechamento de/ });
    expect(within(dialogo).getByText("R$ 100,00")).toBeInTheDocument();
    expect(within(dialogo).getAllByText("Lavador de teste")).toHaveLength(2);
    expect(within(dialogo).getByRole("button", { name: "Baixar relatório" })).toBeEnabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("bloqueia dois cliques rápidos no fechamento diário", async () => {
    let concluir!: (resultado: { data: string; error: null }) => void;
    mocks.rpc.mockReturnValueOnce(
      new Promise<{ data: string; error: null }>((resolve) => {
        concluir = resolve;
      }),
    );
    renderFechamentos("administrador");
    fireEvent.click(screen.getByRole("tab", { name: "Preparar fechamento" }));
    const confirmar = screen.getByRole("button", { name: "Confirmar fechamento" });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    concluir({ data: "fechamento-teste", error: null });
  });

  it("permite fechamento contendo somente ajuste auditado", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: "fechamento-ajuste", error: null });
    renderFechamentos("administrador", {
      atendimentos: [],
      ajustes: [{ id: "ajuste-teste", valor: 1 }],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Preparar fechamento" }));
    expect(screen.getByText("1 · R$ 1,00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar fechamento" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("rpc_fechar_repasses_dia", {
        p_data_operacao: expect.any(String),
        p_atendimentos_pendentes: [],
        p_observacoes: null,
      }),
    );
  });

  it("não cria fechamento vazio quando todos os atendimentos ficam pendentes", () => {
    renderFechamentos("administrador");
    fireEvent.click(screen.getByRole("tab", { name: "Preparar fechamento" }));
    fireEvent.click(
      screen.getByLabelText("Deixar atendimento de Cliente de teste para outro fechamento"),
    );
    expect(screen.getByRole("button", { name: "Confirmar fechamento" })).toBeDisabled();
  });

  it("mantém a navegação do lavador sem ações administrativas", async () => {
    render(
      <QueryClientProvider client={clienteDeTeste([])}>
        <PainelSistema perfilId="lavador-teste" papel="lavador" nome="Lavador de teste" />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("button", { name: "Configurações" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usuários" })).not.toBeInTheDocument();
    const nav = screen.getAllByRole("navigation", { name: "Seções do sistema" })[0]!;
    fireEvent.click(within(nav).getByRole("button", { name: "Repasses" }));
    expect(await screen.findByRole("heading", { name: "Meus repasses" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Repasses" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
