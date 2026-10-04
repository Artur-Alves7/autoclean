# Validação do fluxo de atendimento

Revisão preparada em 02/10/2026 para a Etapa 4. Foram alterados somente o
front-end, funções auxiliares, testes e esta documentação. Não houve alteração
de migrations, políticas RLS, Edge Functions, dados no Supabase Cloud, deploy,
push ou publicação no Lovable.

## Correções implementadas

1. O payload usado por `rpc_criar_atendimento` passou a ser montado por uma
   função testável. Placa vazia é enviada como `null`, placa preenchida é
   aparada e convertida para maiúsculas e `placa_normalizada` nunca é enviada.
2. IDs repetidos de lavadores são eliminados antes da RPC, preservando a ordem
   da primeira seleção.
3. Valor pendente continua sendo enviado como `null`. Quando o valor é
   informado na chegada, vazio ou zero é bloqueado no front-end com mensagem
   clara, antes de chegar ao banco.
4. Erros do schema do cliente/veículo agora exibem a primeira orientação em
   português em vez do JSON técnico produzido pelo Zod.
5. Uma trava síncrona impede dois envios rápidos do mesmo formulário enquanto
   a primeira RPC ainda está em andamento.
6. Veículos sem placa aparecem explicitamente como **Sem placa** na lista de
   escolha, evitando confusão quando o cliente possui múltiplos veículos.
7. O termo usado na busca por placa é normalizado da mesma forma esperada por
   `placa_normalizada`; caracteres reservados do filtro composto são removidos.

## Cobertura automatizada

Os testes usam somente dados fictícios e um cliente Supabase simulado. Eles
exercitam:

- criação de cliente e veículo sem placa;
- placa informada sem escrita em `placa_normalizada`;
- busca normalizada por placa;
- seleção entre múltiplos veículos de um cliente;
- reutilização de cliente e veículo sem criar novos registros;
- serviço e um ou mais lavadores;
- remoção de participantes duplicados no payload;
- valor pendente e valor informado com centavos;
- rejeição de valor vazio ou zero;
- sequência aguardando → em lavagem → pronto para retirada → entregue;
- bloqueio de transições inválidas;
- cancelamento sem motivo suficiente e cancelamento válido;
- ação administrativa de correção de participantes oculta do lavador;
- bloqueio de dois envios concorrentes do formulário;
- regressão das regras de entrega e pagamento já existentes.

A prévia local também foi aberta com dados simulados e sem cliente Supabase. Em
viewport real de 390 px, as quatro seções do formulário, os campos opcionais,
seleção de serviço/lavador e alternância entre valor pendente/informado ficaram
visíveis sem rolagem horizontal. Não houve erro no console e o formulário não
foi enviado nessa inspeção.

Resultados executados nesta revisão:

- testes direcionados do atendimento: 3 arquivos e 24 testes aprovados;
- suíte completa: 6 arquivos e 73 testes aprovados;
- ESLint dos quatro arquivos TypeScript alterados: aprovado sem erros ou
  avisos;
- `tsc --noEmit`: aprovado;
- build Vite/Nitro: aprovado, com os avisos preexistentes de tamanho do bundle,
  resolução de caminhos e opção do empacotador;
- prévia móvel simulada: aprovada nas condições descritas acima.

## Registros parciais e duplicados

`rpc_criar_atendimento` contém, na mesma função PostgreSQL, a criação opcional
do cliente e veículo, o atendimento, os participantes e o histórico inicial.
Pela semântica transacional da chamada, uma exceção durante essa execução deve
reverter as escritas da própria chamada; isso foi confirmado por inspeção do
código versionado, não por execução no Supabase Cloud.

No front-end, participantes repetidos e dois envios simultâneos foram cobertos
por testes. Ainda não existe uma chave de idempotência persistida no banco. Por
isso, duas chamadas independentes que concluam com sucesso — por exemplo, um
novo envio manual depois de uma resposta de rede perdida — ainda podem criar
dois atendimentos. Uma solução completa exigiria mudança aditiva de banco e da
assinatura da RPC; ela não foi introduzida sem validação do ambiente Cloud.

A restrição de placa existente continua sendo tratada: uma placa já cadastrada
retorna mensagem amigável. Não foi encontrada restrição equivalente que defina
quando dois clientes com mesmo nome/telefone devem ser considerados a mesma
pessoa; o fluxo reduz esse risco oferecendo busca antes do cadastro, mas não
faz união automática de clientes.

## Permissões observadas no código

- Administrador e lavador veem a fila ativa e podem abrir **Novo atendimento**.
- Ambos usam `rpc_criar_atendimento` e `rpc_avancar_atendimento`; a RPC valida
  perfil ativo, visibilidade, participantes e transição.
- A fila só mostra ao lavador as ações previstas para atendimentos visíveis.
- A ação **Corrigir lavadores** permanece exclusiva do administrador na
  interface e só aparece quando o atendimento está sem participantes.
- Edição/desativação de cliente ou veículo permanece escondida do lavador.

Essas observações comprovam o comportamento local e o código versionado. A
efetividade das políticas RLS e RPCs no Supabase Cloud será testada na Etapa 7;
esta etapa não declara as permissões de produção como validadas.

## Roteiro manual pendente

Executar somente em ambiente autorizado, com dados fictícios e sessões
separadas. Registrar resultado sem copiar tokens, senhas ou dados reais.

### Cadastro e busca

- [ ] Buscar um cliente fictício existente por nome e por telefone.
- [ ] Buscar o mesmo cliente pela placa com e sem hífen.
- [ ] Confirmar que resultados repetidos por nome e placa aparecem uma só vez.
- [ ] Selecionar cada um de dois veículos do mesmo cliente, incluindo um sem
      placa, e confirmar categoria/modelo corretos.
- [ ] Cadastrar outro veículo sem placa e confirmar que o banco calcula a coluna
      gerada sem erro de `placa_normalizada`.
- [ ] Tentar cadastrar uma placa fictícia já existente e confirmar a mensagem
      de duplicidade, sem cliente/veículo parcial.

### Atendimento e status

- [ ] Criar atendimento com valor pendente, serviço ativo e dois lavadores.
- [ ] Criar outro com valor `89,90` informado na chegada.
- [ ] Confirmar que vazio e zero não são aceitos como valor informado.
- [ ] Clicar rapidamente duas vezes em **Registrar chegada** e confirmar apenas
      um atendimento.
- [ ] Avançar aguardando → em lavagem → pronto para retirada e conferir horários
      e histórico.
- [ ] Tentar uma transição fora de ordem por chamada controlada e confirmar
      rejeição, sem alteração parcial.
- [ ] Cancelar um atendimento: motivo curto deve ser bloqueado; motivo válido
      deve gravar status, data e histórico.

### Papéis

- [ ] Como administrador, criar/avançar/cancelar e corrigir participantes de um
      atendimento sem lavadores.
- [ ] Como lavador, criar e operar atendimento visível, sem acesso a ações
      administrativas de clientes ou participantes.
- [ ] Como lavador, tentar acessar diretamente uma ação administrativa e
      confirmar rejeição da RPC/RLS, não apenas ausência do botão.

## Resultados manuais

| Caso                                | Ambiente | Resultado     | Observação segura |
| ----------------------------------- | -------- | ------------- | ----------------- |
| Busca por nome/telefone/placa       | pendente | não executado | —                 |
| Múltiplos veículos e placa opcional | pendente | não executado | —                 |
| Valor pendente/informado            | pendente | não executado | —                 |
| Status e cancelamento               | pendente | não executado | —                 |
| Administrador e lavador             | pendente | não executado | —                 |
| Escrita parcial/duplicada no Cloud  | pendente | não executado | —                 |
