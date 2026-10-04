import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migration de agendamentos e horários retroativos", () => {
  const sql = readFileSync(
    "supabase/migrations/20261005010000_agendamentos_e_horarios_retroativos.sql",
    "utf8",
  );

  it("adiciona o agendamento sem recriar estruturas existentes", () => {
    expect(sql).toMatch(/add column if not exists agendado_para timestamptz/i);
    expect(sql).not.toMatch(/drop table|truncate table/i);
  });

  it("mantém a criação protegida e aceita um momento opcional", () => {
    expect(sql).toMatch(/p_momento_operacao timestamptz default null/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/revoke all[\s\S]+from public, anon/i);
    expect(sql).toMatch(/grant execute[\s\S]+to authenticated/i);
  });

  it("registra futuro como agendamento e passado como histórico operacional", () => {
    expect(sql).toMatch(/chegou_em = v_momento/i);
    expect(sql).toMatch(
      /agendado_para = case when v_momento > clock_timestamp\(\) then v_momento else null end/i,
    );
    expect(sql).toMatch(/update public\.historico_status[\s\S]+alterado_em = v_momento/i);
    expect(sql).toMatch(/a\.agendado_para[\s\S]+from public\.atendimentos a/i);
  });
});
