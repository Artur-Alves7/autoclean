import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migration de fechamentos retroativos", () => {
  const sql = readFileSync(
    "supabase/migrations/20261005040000_fechamentos_retroativos.sql",
    "utf8",
  );

  it("registra a reabertura em histórico e exige administrador e motivo", () => {
    expect(sql).toMatch(/create table if not exists public\.historico_fechamentos/i);
    expect(sql).toMatch(/rpc_reabrir_fechamento_dia[\s\S]+lc_usuario_eh_admin\(\)/i);
    expect(sql).toMatch(/length\(trim\(coalesce\(p_motivo, ''\)\)\) < 5/i);
    expect(sql).toMatch(/insert into public\.historico_fechamentos/i);
  });

  it("preserva os itens existentes e adiciona somente atendimentos ainda não fechados", () => {
    expect(sql).toMatch(/p_fechamento_id is null[\s\S]+insert into public\.fechamentos_diarios/i);
    expect(sql).toMatch(
      /not exists \([\s\S]+from public\.itens_fechamento item[\s\S]+item\.tipo_lancamento = 'repasse'/i,
    );
    expect(sql).not.toMatch(/delete from public\.itens_fechamento/i);
  });

  it("inclui ajustes feitos depois da reabertura do próprio fechamento", () => {
    expect(sql).toMatch(/rpc_listar_ajustes_fechamento/i);
    expect(sql).toMatch(
      /fechamento\.data_operacao = p_data_operacao[\s\S]+fechamento\.status = 'rascunho'/i,
    );
    expect(sql).toMatch(
      /ajuste\.criado_em::date <= p_data_operacao[\s\S]+item\.fechamento_diario_id = v_id/i,
    );
  });

  it("permite entrega retroativa somente para administrador", () => {
    expect(sql).toMatch(/p_momento_operacao timestamptz default null/i);
    expect(sql).toMatch(/p_momento_operacao is not null and not public\.lc_usuario_eh_admin\(\)/i);
    expect(sql).toMatch(/entregue_em = case[\s\S]+v_momento/i);
    expect(sql).toMatch(/update public\.historico_status[\s\S]+alterado_em = v_momento/i);
  });

  it("não contém operações destrutivas sobre os dados financeiros", () => {
    expect(sql).not.toMatch(/truncate table|drop table|delete from public\.fechamentos_diarios/i);
  });
});
