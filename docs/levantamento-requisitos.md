# Levantamento de requisitos do Auto Clean

## 1. Identificação

- **Sistema:** Auto Clean
- **Área:** gestão operacional e financeira de lava-jato
- **Perfis atendidos:** administrador e lavador
- **Versão do documento:** 1.0
- **Data da revisão:** 05/10/2026

## 2. Contexto

O Auto Clean centraliza a rotina de um lava-jato que antes dependia de registros dispersos. O
sistema acompanha clientes, veículos, atendimentos, participantes, pagamentos, repasses e
fechamentos diários, preservando o histórico necessário para conferência administrativa.

## 3. Objetivos

- registrar atendimentos atuais, retroativos e agendados;
- tornar a fila de trabalho compreensível para administrador e lavadores;
- impedir a entrega de veículos com valores inconsistentes;
- calcular e registrar os repasses com precisão de centavos;
- manter alterações financeiras e operacionais auditáveis;
- separar as permissões de administrador e lavador;
- permitir relatórios sem expor dados além do necessário para cada perfil.

## 4. Perfis de usuário

### 4.1 Administrador

Gerencia toda a operação. Pode convidar usuários, configurar serviços e categorias, editar
cadastros, corrigir atendimentos, confirmar ou reabrir fechamentos e consultar os repasses de
todos os participantes.

### 4.2 Lavador

Executa a operação diária. Pode consultar a fila permitida, registrar atendimentos, participar de
lavagens, avançar etapas, registrar pagamento na saída e consultar os próprios repasses.

## 5. Requisitos funcionais

| ID    | Requisito                                                     | Perfil        | Prioridade | Critério de aceite                                                                                |
| ----- | ------------------------------------------------------------- | ------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| RF-01 | Autenticar usuário por e-mail e senha                         | Todos         | Alta       | Usuário válido entra na área correspondente ao papel; credenciais inválidas não concedem acesso   |
| RF-02 | Recuperar e definir uma nova senha pelo Supabase Auth         | Todos         | Alta       | Link válido permite definir a senha e sessão inválida exibe orientação segura                     |
| RF-03 | Direcionar cada usuário para a área autorizada                | Todos         | Alta       | Administrador acessa `/admin`, lavador acessa `/lavador` e tentativas cruzadas são redirecionadas |
| RF-04 | Convidar administrador ou lavador por e-mail                  | Administrador | Alta       | Edge Function aceita a solicitação apenas de administrador autenticado                            |
| RF-05 | Listar, ativar, desativar e alterar o papel de usuários       | Administrador | Alta       | Alteração válida é persistida e usuário sem permissão é bloqueado                                 |
| RF-06 | Listar clientes em ordem alfabética                           | Todos         | Média      | Clientes visíveis aparecem ordenados pelo nome                                                    |
| RF-07 | Listar os veículos de cada cliente                            | Todos         | Média      | Cada cliente apresenta apenas seus veículos, organizados por marca e modelo                       |
| RF-08 | Cadastrar outro veículo para cliente existente                | Todos         | Alta       | Veículo válido é associado ao cliente sem exigir novo cadastro de pessoa                          |
| RF-09 | Editar ou desativar clientes e veículos                       | Administrador | Média      | Alteração preserva o histórico relacionado                                                        |
| RF-10 | Cadastrar, editar e desativar categorias e serviços           | Administrador | Média      | Configuração ativa fica disponível em novos atendimentos                                          |
| RF-11 | Criar atendimento para agora, horário passado ou futuro       | Todos         | Alta       | Registro contém cliente, veículo, serviço, lavadores, horário, observações e valor opcional       |
| RF-12 | Permitir placa opcional e normalizá-la no banco               | Todos         | Alta       | Frontend envia apenas `placa`; `placa_normalizada` é calculada pelo PostgreSQL                    |
| RF-13 | Exibir a central de atendimentos por data e etapa             | Todos         | Alta       | Data pode ser alterada e registros aparecem em aguardando, em lavagem, pronto e concluído         |
| RF-14 | Avançar um atendimento pelas etapas permitidas                | Todos         | Alta       | Apenas a próxima transição válida é aceita e o horário da mudança é registrado                    |
| RF-15 | Cancelar atendimento com justificativa                        | Todos         | Alta       | Cancelamento sem motivo é recusado e motivo válido integra o histórico                            |
| RF-16 | Corrigir os participantes de atendimento ativo                | Administrador | Média      | Nova lista possui ao menos um lavador, não contém duplicidade e substitui a anterior              |
| RF-17 | Editar informações do atendimento em qualquer etapa           | Administrador | Alta       | Edição exige motivo, valida referências e gera histórico dos valores                              |
| RF-18 | Informar ou corrigir o valor final                            | Administrador | Alta       | Valor positivo pode ser salvo e atendimento entregue nunca fica sem valor final                   |
| RF-19 | Registrar pagamento único ou dividido                         | Todos         | Alta       | Cada parcela possui forma e valor positivos e a soma é calculada em centavos                      |
| RF-20 | Mostrar o QR Code quando houver pagamento Pix                 | Todos         | Média      | Imagem aparece no próprio fluxo de pagamento sem abrir aplicação externa                          |
| RF-21 | Bloquear entrega com pagamento inconsistente                  | Todos         | Alta       | Entrega só ocorre quando pagamentos equivalem exatamente ao valor final                           |
| RF-22 | Consultar movimento e repasses por data                       | Todos         | Alta       | Administrador vê todos; lavador vê apenas valores do próprio perfil                               |
| RF-23 | Calcular parte da empresa e rateio entre lavadores            | Administrador | Alta       | Function retorna total exato e distribui eventual resto deterministicamente                       |
| RF-24 | Criar fechamento para data atual ou passada ainda não fechada | Administrador | Alta       | Data não futura é aceita e não existe duplicidade para a mesma data operacional                   |
| RF-25 | Reabrir fechamento confirmado com justificativa               | Administrador | Alta       | Reabertura exige motivo, volta a rascunho e registra a ação                                       |
| RF-26 | Registrar ajustes sem alterar lançamento confirmado           | Administrador | Alta       | Diferença gera ajuste auditado e é consumida em fechamento posterior ou reaberto                  |
| RF-27 | Exportar relatórios de atendimentos e repasses                | Todos         | Média      | Usuário escolhe dia, período ou histórico e baixa dados compatíveis com sua permissão             |
| RF-28 | Consultar histórico por cliente e veículo                     | Todos         | Média      | Pesquisa retorna apenas registros permitidos e preserva dados históricos de exibição              |

## 6. Requisitos não funcionais

| ID     | Requisito                                                 | Categoria       | Prioridade | Critério de aceite                                                               |
| ------ | --------------------------------------------------------- | --------------- | ---------- | -------------------------------------------------------------------------------- |
| RNF-01 | Proteger dados com autenticação, RLS e validação nas RPCs | Segurança       | Alta       | Operações negadas não dependem somente do frontend                               |
| RNF-02 | Manter a chave `service_role` exclusivamente no servidor  | Segurança       | Alta       | Chave não aparece no código, bundle, `.env.example` ou variáveis `VITE_*`        |
| RNF-03 | Não versionar credenciais nem dados reais                 | Privacidade     | Alta       | Repositório possui modelo de ambiente vazio e dados acadêmicos fictícios         |
| RNF-04 | Trabalhar com centavos nas validações e rateios           | Integridade     | Alta       | Comparações e divisões financeiras não perdem nem criam centavos                 |
| RNF-05 | Registrar alterações sensíveis e mudanças de estado       | Auditoria       | Alta       | Histórico identifica operação, responsável, horário e motivo quando aplicável    |
| RNF-06 | Oferecer interface responsiva entre 320 px e 1440 px      | Usabilidade     | Alta       | Não há rolagem horizontal indevida e controles principais permanecem utilizáveis |
| RNF-07 | Oferecer foco visível, rótulos e navegação por teclado    | Acessibilidade  | Média      | Campos e ações possuem nome acessível e foco perceptível                         |
| RNF-08 | Manter navegadores modernos e instalação como PWA         | Compatibilidade | Média      | Build gera manifesto, service worker e ícones válidos                            |
| RNF-09 | Preservar consistência nas operações compostas            | Confiabilidade  | Alta       | Criação, avanço e fechamento são executados por transações no banco              |
| RNF-10 | Manter código testável e documentação rastreável          | Manutenção      | Média      | Testes, lint, TypeScript e build podem ser executados pelos scripts do projeto   |
| RNF-11 | Fixar o `search_path` das rotinas privilegiadas           | Segurança       | Alta       | Rotinas `SECURITY DEFINER` relevantes usam `pg_catalog, public`                  |
| RNF-12 | Utilizar a data operacional no fuso de Fortaleza          | Integridade     | Alta       | Atendimento não muda de dia financeiro por conversão implícita de UTC            |

## 7. Regras de negócio

| ID    | Regra                                                                         | Requisitos relacionados    |
| ----- | ----------------------------------------------------------------------------- | -------------------------- |
| RN-01 | O sistema possui somente os papéis `administrador` e `lavador`                | RF-03, RF-04, RF-05        |
| RN-02 | Apenas administrador gerencia usuários, configurações e fechamentos           | RF-05, RF-10, RF-24, RF-25 |
| RN-03 | Atendimento precisa de cliente, veículo, serviço e ao menos um lavador válido | RF-11, RF-16               |
| RN-04 | O veículo selecionado deve pertencer ao cliente informado                     | RF-08, RF-11, RF-17        |
| RN-05 | A placa é opcional; sua versão normalizada é produzida pelo banco             | RF-12                      |
| RN-06 | Valor pode ficar pendente na chegada, mas é obrigatório e positivo na entrega | RF-11, RF-18, RF-21        |
| RN-07 | A sequência normal é aguardando, em lavagem, pronto para retirada e entregue  | RF-13, RF-14               |
| RN-08 | Atendimento ativo só pode ser cancelado com motivo                            | RF-15                      |
| RN-09 | Entrega exige lavador e pagamentos que totalizem o valor final                | RF-16, RF-19, RF-21        |
| RN-10 | A parte da empresa é congelada no atendimento                                 | RF-23                      |
| RN-11 | O restante é dividido igualmente; centavos restantes seguem `ordem_rateio`    | RF-23                      |
| RN-12 | Atendimento pertence financeiramente à data de chegada/agendamento            | RF-22, RF-24               |
| RN-13 | Só pode existir um fechamento por data operacional                            | RF-24                      |
| RN-14 | Fechamento e movimentação retroativa não podem estar no futuro                | RF-11, RF-14, RF-24        |
| RN-15 | Fechamento confirmado e itens são imutáveis fora da reabertura auditada       | RF-25, RF-26               |
| RN-16 | Correção financeira posterior gera diferença, nunca reescrita silenciosa      | RF-17, RF-26               |
| RN-17 | Cadastros históricos são desativados, não excluídos fisicamente               | RF-09, RF-10, RF-28        |
| RN-18 | Lavador consulta somente registros permitidos pelas políticas do banco        | RF-13, RF-22, RF-27, RF-28 |

## 8. Fluxos principais

### 8.1 Atendimento e entrega

1. Usuário seleciona ou cadastra cliente e veículo.
2. Informa serviço, participantes, horário e valor opcional.
3. Atendimento entra na etapa aguardando.
4. Operador avança para em lavagem e pronto para retirada.
5. Na saída, informa valor final e um ou mais pagamentos.
6. O banco valida participantes, valor e pagamentos antes de marcar como entregue.

### 8.2 Fechamento e repasse

1. Administrador seleciona uma data operacional.
2. A aplicação consulta atendimentos entregues da data.
3. O fechamento chama a RPC que executa a Procedure.
4. A Procedure usa a Function de rateio para cada atendimento elegível.
5. Os itens são persistidos e apresentados na tela de Repasses.
6. Correções futuras geram ajustes auditados.

### 8.3 Convite e primeiro acesso

1. Administrador informa e-mail, nome, telefone e papel.
2. Edge Function valida JWT e papel administrativo.
3. Supabase Auth envia o convite.
4. Convidado define a senha e entra na área correspondente ao papel.

## 9. Rastreabilidade

| Área                  | Implementação principal                                             | Evidência automatizada                                                         |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Autenticação e acesso | `src/routes`, `src/lib/acesso.ts`, Edge Function `convidar-usuario` | `autenticacao.test.ts`, `app-routing.test.tsx`, `convidar-usuario.test.ts`     |
| Atendimentos          | `src/components/Atendimentos.tsx` e RPCs de atendimento             | `atendimentos.test.tsx`, `agendamentos.test.ts`, `edicao-atendimentos.test.ts` |
| Clientes e veículos   | `src/components/ClientesVeiculos.tsx`                               | `adicionar-veiculo.test.ts`                                                    |
| Pagamento e entrega   | `Atendimentos.tsx`, `src/lib/regras.ts`                             | `regras.test.ts`, `fechamento.test.ts`                                         |
| Repasses e fechamento | `Fechamentos.tsx`, `fn_calcular_repasse`, `sp_fechar_repasses_dia`  | `fechamentos-retroativos.test.ts`, `repasses-data-atendimento.test.ts`         |
| Relatórios            | `src/components/Relatorios.tsx`, `src/lib/relatorios.ts`            | `relatorios.test.ts`                                                           |
| Segurança             | RLS e RPCs em `supabase/migrations`                                 | `seguranca.test.ts` e documentos de validação                                  |
