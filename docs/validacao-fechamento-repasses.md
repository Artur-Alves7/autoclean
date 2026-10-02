# Validação do fechamento diário e repasses

Revisão preparada em 02/10/2026 para a Etapa 6. Foram alterados o front-end,
as regras testáveis, os testes, a documentação e uma migration aditiva. Nenhuma
migration antiga foi modificada ou reaplicada. Não houve conexão, SQL, deploy
ou alteração de dados no Supabase Cloud, nem push ou publicação no Lovable.

## Diagnóstico do fechamento duplicado

O erro informado foi:

`duplicate key value violates unique constraint "fechamentos_diarios_data_operacao_key"`

A causa foi confirmada no SQL versionado: cada chamada de
`rpc_fechar_repasses_dia` executava um `insert` novo em `fechamentos_diarios`,
mesmo quando a data já possuía um fechamento confirmado. A interface também
continuava mostrando o botão de confirmação depois do sucesso. Uma repetição,
duplo clique tardio ou chamada concorrente de outro administrador alcançava a
restrição única e expunha a mensagem técnica do PostgreSQL.

## Correções implementadas

### Banco preparado, ainda não aplicado

A migration
`supabase/migrations/20261002013000_fechamento_diario_idempotente.sql`:

1. serializa fechamentos da mesma data com um advisory lock transacional;
2. retorna o ID já confirmado quando a mesma data é solicitada novamente, sem
   criar ou alterar lançamentos;
3. cria o fechamento como `rascunho`, grava repasses e ajustes e somente então
   muda o status para `confirmado`;
4. impede `insert`, `update` e `delete` de itens ligados a um fechamento já
   confirmado;
5. rejeita fechamento vazio e datas futuras;
6. lista atendimentos elegíveis de dias anteriores ainda não fechados, para que
   um atendimento adiado não fique perdido;
7. consome somente ajustes criados até a data da operação;
8. usa `UPDATE ... RETURNING` para marcar e inserir ajustes na mesma instrução,
   evitando perda em uma correção concorrente;
9. calcula correções sucessivas contra lançamentos já processados e ajustes
   ainda pendentes, sem somar novamente toda a diferença do repasse original;
10. mantém a validação de administrador na listagem, correção e fechamento.

### Interface

- Consulta o fechamento existente para a data selecionada e desativa uma nova
  confirmação quando ele já está confirmado.
- Evita duas chamadas locais em cliques rápidos.
- Limpa a seleção de pendências ao trocar a data.
- Não permite selecionar uma data futura.
- Exibe atendimentos anteriores ainda elegíveis e o total de ajustes pendentes.
- Permite um fechamento contendo apenas ajustes, mesmo sem atendimento novo.
- Não permite fechamento vazio quando todos os atendimentos foram adiados.
- Traduz a mensagem da restrição única antiga enquanto a migration nova ainda
  não tiver sido aplicada.

## Rateio validado em centavos

O resumo do front-end passou a usar inteiros em centavos e a mesma ordem de
rateio do banco. O caso fictício exercitado foi:

- valor final: R$ 100,03;
- parte da empresa: R$ 40,00;
- restante: R$ 60,03;
- quatro lavadores, pela ordem: R$ 15,01, R$ 15,01, R$ 15,01 e R$ 15,00;
- soma final: R$ 100,03, sem perda de centavos.

Também foi exercitada uma inconsistência de R$ 0,01 e a exclusão explícita de
um atendimento adiado do resumo atual.

## Ajuste posterior esperado

Para um atendimento fechado de R$ 100,03 corrigido para R$ 101,03, mantendo o
snapshot da empresa em R$ 40,00 e os mesmos quatro lavadores:

- o fechamento original e seus itens permanecem imutáveis;
- a correção registra histórico e quatro diferenças de R$ 0,25 para os
  lavadores, totalizando R$ 1,00;
- o próximo fechamento elegível insere essas diferenças como `ajuste`;
- os registros são marcados como processados no mesmo comando que produz os
  itens, impedindo reaplicação.

Se houver outra correção antes desse próximo fechamento, a nova diferença será
calculada sobre o repasse original mais os ajustes ainda pendentes. Assim, a
segunda correção não repete os R$ 1,00 já programados.

Esse resultado foi confirmado pelas fórmulas e pelo SQL versionado, não por
execução em um banco real.

## Verificações automatizadas

- testes direcionados: 3 arquivos e 34 testes aprovados;
- rateio e somas conferidos em centavos inteiros;
- comportamento da interface para fechamento já confirmado, duplo clique,
  fechamento somente com ajuste e fechamento vazio coberto por testes;
- presença das garantias críticas da migration coberta por teste estático;
- suíte completa: 7 arquivos e 91 testes aprovados;
- ESLint dos arquivos TypeScript alterados: aprovado;
- TypeScript com `tsc --noEmit`: aprovado;
- build Vite/Nitro: aprovado.

O build manteve avisos preexistentes sobre `vite-tsconfig-paths`, tamanho do
bundle e `inlineDynamicImports`. Eles não interromperam a compilação e não foram
alterados nesta etapa.

## Limites desta validação

- O SQL não foi executado contra PostgreSQL ou Supabase local/Cloud; não há
  declaração de que a migration foi aplicada ou validada em produção.
- O teste estático protege a presença das decisões críticas, mas não substitui
  parsing e execução reais da migration.
- Autorização efetiva, RLS e tentativas negadas com sessões reais serão
  aprofundadas na Etapa 7.

## Aplicação manual futura

Somente após revisão, backup e autorização explícita:

1. confirmar no painel que as migrations até
   `20261002012000_ajustes_repasse.sql` já existem;
2. revisar diferenças dos objetos `sp_fechar_repasses_dia`,
   `rpc_fechar_repasses_dia` e `lc_bloquear_item_fechamento_confirmado`;
3. aplicar apenas
   `supabase/migrations/20261002013000_fechamento_diario_idempotente.sql`;
4. não recriar tabelas e não executar novamente as migrations anteriores;
5. testar em homologação antes de qualquer uso em produção.

## Roteiro manual com dados fictícios

### Rateio e fechamento

- [ ] Preparar atendimento de R$ 100,03, snapshot da empresa em R$ 40,00 e
      quatro lavadores; confirmar o rateio 15,01 / 15,01 / 15,01 / 15,00.
- [ ] Deixar um atendimento fictício pendente, fechar os demais e confirmar que
      ele aparece como elegível na data seguinte.
- [ ] Confirmar o fechamento e verificar status, horário, administrador e itens.
- [ ] Clicar novamente e confirmar retorno idempotente, sem novo fechamento ou
      novos itens.
- [ ] Usar duas sessões administrativas para confirmar a mesma data quase ao
      mesmo tempo; deve existir somente um fechamento.
- [ ] Tentar fechar uma data futura e uma data sem repasses/ajustes; ambas devem
      ser rejeitadas.

### Imutabilidade e ajuste

- [ ] Tentar inserir, editar e excluir item do fechamento confirmado por uma
      chamada controlada; todas devem ser rejeitadas.
- [ ] Corrigir o atendimento fictício de R$ 100,03 para R$ 101,03 com motivo.
- [ ] Confirmar histórico, fechamento original intacto e R$ 1,00 em ajustes
      pendentes.
- [ ] Fechar a data seguinte mesmo sem atendimento novo e confirmar os ajustes.
- [ ] Repetir a confirmação e verificar que nenhum ajuste foi aplicado duas
      vezes.
- [ ] Como lavador, confirmar acesso apenas aos próprios repasses e rejeição das
      RPCs administrativas.

## Resultados manuais

| Caso                                   | Ambiente | Resultado     | Observação segura |
| -------------------------------------- | -------- | ------------- | ----------------- |
| Rateio com sobra de centavos           | pendente | não executado | —                 |
| Fechamento idempotente                 | pendente | não executado | —                 |
| Duas sessões administrativas           | pendente | não executado | —                 |
| Pendência carregada para data seguinte | pendente | não executado | —                 |
| Imutabilidade de fechamento e itens    | pendente | não executado | —                 |
| Ajuste posterior sem duplicação        | pendente | não executado | —                 |
| Permissões administrativas             | pendente | não executado | —                 |
