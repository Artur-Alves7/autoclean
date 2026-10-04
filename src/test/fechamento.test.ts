import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  calcularResumoFechamento,
  dataLocalIso,
  deslocarDataLocal,
  intervaloDataLocal,
} from "@/lib/fechamento";
import { dividirRepasseCentavos } from "@/lib/regras";
import { mensagemErro } from "@/lib/supabase-db";

describe("fechamento diário", () => {
  it("mantém a data local perto da virada do dia", () => {
    expect(dataLocalIso(new Date(2026, 9, 2, 23, 59, 59))).toBe("2026-10-02");
  });

  it("navega entre dias e cria limites locais completos", () => {
    expect(deslocarDataLocal("2026-10-01", -1)).toBe("2026-09-30");
    expect(deslocarDataLocal("2026-10-31", 1)).toBe("2026-11-01");
    const intervalo = intervaloDataLocal("2026-10-04");
    expect(new Date(intervalo.fim).getTime() - new Date(intervalo.inicio).getTime()).toBe(
      86_400_000,
    );
  });

  it("rateia centavos pela ordem e preserva o total", () => {
    const resumo = calcularResumoFechamento(
      [
        {
          id: "atendimento-centavos",
          valor_final: 100.03,
          valor_empresa_snapshot: 40,
          total_pago: 100.03,
          lavadores: [
            { perfil_id: "lavador-4", nome: "Lavador 4", ordem_rateio: 4 },
            { perfil_id: "lavador-1", nome: "Lavador 1", ordem_rateio: 1 },
            { perfil_id: "lavador-3", nome: "Lavador 3", ordem_rateio: 3 },
            { perfil_id: "lavador-2", nome: "Lavador 2", ordem_rateio: 2 },
          ],
        },
      ],
      [],
    );

    expect(resumo.empresaCentavos).toBe(4000);
    expect(resumo.totalCentavos).toBe(10003);
    expect(resumo.porLavador).toEqual([
      { nome: "Lavador 1", valorCentavos: 1501 },
      { nome: "Lavador 2", valorCentavos: 1501 },
      { nome: "Lavador 3", valorCentavos: 1501 },
      { nome: "Lavador 4", valorCentavos: 1500 },
    ]);
    expect(resumo.porLavador.reduce((total, item) => total + item.valorCentavos, 4000)).toBe(10003);
  });

  it("separa pendências e conta inconsistências sem ponto flutuante", () => {
    const resumo = calcularResumoFechamento(
      [
        {
          id: "pendente",
          valor_final: 90.01,
          valor_empresa_snapshot: 30,
          total_pago: 90.01,
          lavadores: [{ perfil_id: "lavador-1", nome: "Lavador 1", ordem_rateio: 1 }],
        },
        {
          id: "inconsistente",
          valor_final: 10.01,
          valor_empresa_snapshot: 4,
          total_pago: 10,
          lavadores: [{ perfil_id: "lavador-2", nome: "Lavador 2", ordem_rateio: 1 }],
        },
      ],
      ["pendente"],
    );

    expect(resumo.totalCentavos).toBe(1001);
    expect(resumo.empresaCentavos).toBe(400);
    expect(resumo.inconsistentes).toBe(1);
    expect(resumo.porLavador).toEqual([]);
  });

  it("calcula correções sucessivas somente sobre a diferença ainda não lançada", () => {
    const original = dividirRepasseCentavos(10003, 4000, 4);
    const primeiraCorrecao = dividirRepasseCentavos(10103, 4000, 4);
    const segundaCorrecao = dividirRepasseCentavos(10203, 4000, 4);

    expect(primeiraCorrecao.map((valor, indice) => valor - original[indice]!)).toEqual([
      25, 25, 25, 25,
    ]);
    expect(segundaCorrecao.map((valor, indice) => valor - primeiraCorrecao[indice]!)).toEqual([
      25, 25, 25, 25,
    ]);
  });

  it("traduz a restrição única antiga para uma mensagem operacional", () => {
    expect(
      mensagemErro({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "fechamentos_diarios_data_operacao_key"',
      }),
    ).toBe("O fechamento desta data já foi confirmado.");
  });

  it("mantém na migration a idempotência, o bloqueio e o carregamento de pendências", () => {
    const sql = readFileSync(
      "supabase/migrations/20261002013000_fechamento_diario_idempotente.sql",
      "utf8",
    );

    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/if v_status = 'confirmado' then\s+return v_id;/i);
    expect(sql).toMatch(/entregue_em::date <= p_data_operacao/);
    expect(sql).toMatch(/status\s*=\s*'confirmado'/);
    expect(sql).toMatch(/before insert or update or delete on public\.itens_fechamento/i);
    expect(sql).toMatch(/ajuste\.criado_em::date <= p_data_operacao/);
    expect(sql).toMatch(/with ajustes_processados as \(\s+update[\s\S]+returning/i);
    expect(sql).toMatch(/union all[\s\S]+ajuste\.processado_em is null/i);
    expect(sql).toMatch(/from distribuicao_anterior anterior[\s\S]+full join/i);
  });
});
