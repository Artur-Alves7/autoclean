# Validação de pagamento e entrega

Revisão preparada em 02/10/2026 para a Etapa 5. Foram alterados somente o
front-end, as regras testáveis, os testes e esta documentação. Não houve
alteração de banco, migrations, políticas RLS, Edge Functions ou dados no
Supabase Cloud. Também não houve deploy, push ou publicação no Lovable.

## Correções implementadas

1. O avanço de status que não representa uma entrega agora envia
   `p_pagamentos: null`. Antes, uma lista vazia era enviada para a RPC e podia
   acionar desnecessariamente o trecho que substitui os pagamentos.
2. A entrega exige valor final maior que zero, pelo menos uma forma de
   pagamento e valor positivo em cada pagamento.
3. Valores vazios ou com mais de duas casas decimais são rejeitados antes da
   RPC. Vírgula e ponto continuam aceitos como separador decimal.
4. O valor final é convertido para centavos uma única vez na confirmação,
   evitando cálculos divergentes no mesmo envio.
5. Pagamentos divididos mostram o total informado e indicam se o valor foi
   conferido, se falta ou se excede algum valor.
6. Uma trava síncrona impede duas chamadas da RPC em cliques rápidos no botão
   de confirmação.
7. A correção administrativa de atendimento entregue também bloqueia valor
   final zero no front-end.

## Casos automatizados com dados fictícios

| Caso                                                             | Resultado local                          |
| ---------------------------------------------------------------- | ---------------------------------------- |
| Valor final de R$ 100,03, PIX de R$ 60,01 e dinheiro de R$ 40,02 | aceito; payload totaliza 10.003 centavos |
| Valor final de R$ 100,04 com os mesmos pagamentos                | bloqueado por diferença de R$ 0,01       |
| Valor final vazio                                                | bloqueado antes da RPC                   |
| Valor final igual a zero                                         | bloqueado antes da RPC                   |
| Valor com três casas decimais                                    | bloqueado antes da RPC                   |
| Pagamento vazio ou igual a zero                                  | bloqueado antes da RPC                   |
| Atendimento sem lavador                                          | bloqueado antes da entrega               |
| Dois cliques rápidos em **Confirmar**                            | somente uma chamada da RPC               |
| Avanço para pronto, sem entrega                                  | envia `p_pagamentos: null`               |
| Correção financeira exibida ao lavador                           | não exibida                              |
| Correção financeira exibida ao administrador                     | exibida                                  |

Os testes simulam o cliente Supabase e não gravam informações. Os nomes,
veículos, identificadores e valores usados são todos fictícios.

## Permissões e garantias observadas

- Administrador e lavador podem registrar entrega quando o atendimento está
  visível para o perfil. A RPC versionada valida visibilidade, sequência de
  status, participante vinculado e igualdade entre valor final e pagamentos.
- A interface de correção de atendimento já entregue está disponível somente
  para o administrador.
- `rpc_corrigir_atendimento_entregue` repete no servidor a autorização de
  administrador, exige motivo, valor final positivo, igualdade dos pagamentos
  e registra histórico.
- A substituição dos pagamentos, validações, mudança de status e histórico
  estão na mesma função PostgreSQL. Pela semântica transacional da chamada,
  uma exceção deve reverter as escritas da própria chamada. Isso foi confirmado
  por inspeção do SQL versionado, não por execução no Supabase Cloud.

A RPC de entrega versionada não contém uma validação explícita de valor final
e pagamentos maiores que zero; o front-end agora aplica essa regra, mas um
cliente que invoque a RPC diretamente ainda precisa ser verificado na revisão
de segurança da Etapa 7. Nenhuma migration já aplicada foi modificada nesta
etapa.

## Verificações executadas

- testes direcionados: 2 arquivos e 24 testes aprovados;
- suíte completa: 6 arquivos e 81 testes aprovados;
- ESLint dos 5 arquivos TypeScript alterados: aprovado após formatação;
- TypeScript com `tsc --noEmit`: aprovado;
- build Vite/Nitro: aprovado;
- prévia local: o servidor iniciou, mas o navegador interno bloqueou o endereço
  local antes de carregar a página; portanto, a inspeção visual móvel não foi
  marcada como aprovada.

O build manteve avisos preexistentes sobre `vite-tsconfig-paths`, tamanho do
bundle e opção `inlineDynamicImports`. Eles não interromperam a compilação e
não foram alterados nesta etapa.

## Roteiro manual pendente

Executar somente em ambiente autorizado, com contas e dados fictícios. Não
copiar tokens, senhas, chaves ou dados reais para este documento.

### Entrega e pagamentos

- [ ] Criar um atendimento com preço pendente e avançá-lo até **Pronto para
      retirada**.
- [ ] Informar o preço final somente na saída e confirmar que ele é persistido.
- [ ] Entregar um atendimento de R$ 100,03 com PIX de R$ 60,01 e dinheiro de
      R$ 40,02; conferir os dois pagamentos e o status entregue.
- [ ] Repetir com o segundo pagamento em R$ 40,01 e confirmar o bloqueio por
      diferença de R$ 0,01, sem pagamento parcial gravado.
- [ ] Testar valor final vazio, zero e com três casas decimais; confirmar que a
      RPC não é chamada pela interface.
- [ ] Tentar entregar sem participante e confirmar o bloqueio.
- [ ] Clicar duas vezes rapidamente em **Confirmar** e verificar um único
      histórico de entrega.

### Papéis e alteração posterior

- [ ] Como lavador participante, registrar uma entrega visível e conferir que
      não aparece a ação de correção financeira posterior.
- [ ] Como lavador não participante, tentar consultar/alterar o atendimento por
      chamada controlada e confirmar a rejeição da RPC/RLS.
- [ ] Como administrador, corrigir um atendimento entregue com motivo fictício
      de pelo menos cinco caracteres e confirmar o histórico de auditoria.
- [ ] Como lavador, tentar invocar diretamente a RPC de correção e confirmar o
      erro de autorização do servidor.
- [ ] Confirmar que uma correção posterior a fechamento gera ajuste auditado;
      o comportamento completo será validado na Etapa 6.

## Resultados manuais

| Caso                                  | Ambiente | Resultado     | Observação segura |
| ------------------------------------- | -------- | ------------- | ----------------- |
| Preço pendente informado na saída     | pendente | não executado | —                 |
| Pagamento dividido com centavos       | pendente | não executado | —                 |
| Bloqueio por diferença de R$ 0,01     | pendente | não executado | —                 |
| Duplo clique na entrega               | pendente | não executado | —                 |
| Permissões de administrador e lavador | pendente | não executado | —                 |
| Auditoria da correção posterior       | pendente | não executado | —                 |
