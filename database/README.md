# Scripts acadêmicos do banco de dados

Esta pasta organiza os objetos exigidos na atividade de Banco de Dados. Os arquivos foram
preparados a partir dos tipos gerados do Supabase e das definições vigentes nas migrations.

> **Atenção:** estes scripts são material acadêmico e de reconstrução local. Não os execute no
> Supabase Cloud de produção. O histórico operacional oficial permanece em
> `supabase/migrations`.

## Estrutura

```text
database/
├── tables/001_schema_base.sql
├── views/001_vw_painel_atendimentos.sql
├── functions/001_funcoes_autorizacao.sql
├── functions/002_fn_calcular_repasse.sql
├── functions/003_rpc_fechar_repasses_dia.sql
└── procedures/001_sp_fechar_repasses_dia.sql
```

## Recursos avaliados

| Recurso   | Objeto                   | Finalidade                                            | Uso na aplicação                                 |
| --------- | ------------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| View      | `vw_painel_atendimentos` | Consolidar atendimento, participantes e pagamentos    | Atendimentos, clientes, fechamentos e relatórios |
| Function  | `fn_calcular_repasse`    | Dividir o valor em centavos entre empresa e lavadores | Executada pela Procedure de fechamento           |
| Procedure | `sp_fechar_repasses_dia` | Registrar os itens financeiros de uma data            | Chamada pela RPC usada na tela de Repasses       |

## Origem e limitações

O repositório não possuía a migration inicial do sistema. Por isso, o esquema base foi
reconstruído a partir de `src/integrations/supabase/types.ts` e complementado pelas constraints
visíveis nas migrations atuais. As migrations em `supabase/migrations` continuam sendo o
histórico operacional do sistema.
