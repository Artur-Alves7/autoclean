import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilaAtendimentos } from "@/components/Atendimentos";
import { PainelSistema } from "@/components/PainelSistema";
import { StatusBadge } from "@/components/StatusBadge";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ error: null }),
  navegar: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navegar }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));
vi.mock("@/lib/supabase-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase-db")>()),
  db: () => ({ rpc: mocks.rpc }),
}));

const categoriaId = "d5319fa3-36ef-4f7d-a5ae-4f5399ea0e18";
const filaTeste = [
  {
    id: "atendimento-teste",
    status: "pronto_para_retirada",
    chegou_em: "2026-10-02T08:30:00-03:00",
    valor_final: 100,
    nome_cliente_snapshot: "Cliente de teste",
    veiculo_snapshot: "Veículo de teste",
    categoria_veiculo_snapshot: "Categoria de teste",
    servico_snapshot: "Serviço de teste",
    lavadores: [{ perfil_id: "lavador-teste", nome: "Lavador de teste", ordem_rateio: 1 }],
  },
];

function clienteDeTeste(fila = filaTeste) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["fila-atendimentos"], fila);
  qc.setQueryData(["auxiliares-atendimento"], {
    categorias: [{ id: categoriaId, nome: "Categoria de teste" }],
    servicos: [{ id: "servico-teste", nome: "Serviço de teste" }],
    lavadores: [{ id: "lavador-teste", nome: "Lavador de teste" }],
  });
  qc.setQueryData(["meus-repasses", "lavador-teste"], []);
  return qc;
}

function renderFila(fila = filaTeste) {
  return render(
    <QueryClientProvider client={clienteDeTeste(fila)}>
      <FilaAtendimentos perfilId="lavador-teste" papel="lavador" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("interface operacional", () => {
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
      "Entregue",
      "Cancelado",
    ]) {
      expect(screen.getByText(nome)).toBeInTheDocument();
    }
  });

  it("mantém a fila vazia e o botão de chegada funcionais", () => {
    renderFila([]);
    expect(screen.getByText("Nenhum atendimento ativo.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Novo atendimento" }));
    expect(screen.getByRole("form", { name: "Registrar chegada" })).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar cliente por nome, telefone ou placa")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("preserva cadastro, participantes e preço pendente no payload", async () => {
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
    expect(screen.getByLabelText("Informar valor depois")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Registrar chegada" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "rpc_criar_atendimento",
        expect.objectContaining({
          p_cliente: { nome_completo: "Cliente de teste", telefone: "85999999999" },
          p_lavadores: ["lavador-teste"],
          p_valor_final: null,
          p_servico_id: "servico-teste",
        }),
      ),
    );
    expect(mocks.rpc.mock.calls[0]![1].p_veiculo).not.toHaveProperty("placa_normalizada");
  });

  it("abre diálogo de entrega com campos rotulados e restaura foco ao fechar", async () => {
    renderFila();
    const acao = screen.getByRole("button", { name: "Registrar entrega" });
    acao.focus();
    fireEvent.click(acao);
    const dialog = screen.getByRole("dialog", { name: "Registrar entrega" });
    expect(within(dialog).getByLabelText("Forma 1")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Valor (R$)", { exact: true })).toBeInTheDocument();
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
