# Auto Clean

Sistema web para gestão operacional e financeira de um lava-jato real. O Auto Clean organiza a
fila de veículos, clientes, serviços, pagamentos, repasses e fechamentos diários em uma única
aplicação responsiva.

## Identificação acadêmica

- **Aluno:** Artur Alves
- **Disciplina:** Banco de Dados
- **Professor:** Anderson Soares Costa
- **Modalidade:** trabalho individual

## Problema e solução

O controle manual de um lava-jato dificulta acompanhar a etapa de cada veículo, conferir
pagamentos e dividir os valores entre empresa e lavadores. O Auto Clean oferece uma central de
atendimentos por data, registra todo o fluxo até a entrega e executa o fechamento financeiro com
regras consistentes no PostgreSQL.

## Funcionalidades

- login, recuperação de senha, convite e primeiro acesso;
- áreas separadas para administrador e lavador;
- fila por data com aguardando, em lavagem, pronto para retirada e concluído;
- atendimento imediato, retroativo ou agendado;
- clientes com múltiplos veículos e placa opcional;
- valor pendente ou informado na chegada;
- pagamento único ou dividido, com QR Code Pix na própria tela;
- entrega condicionada à consistência entre valor final e pagamentos;
- edição administrativa auditada em qualquer etapa;
- repasses e fechamentos atuais ou retroativos;
- reabertura auditada e ajustes posteriores sem apagar lançamentos confirmados;
- relatórios de atendimentos e repasses por dia, período ou histórico.

O levantamento completo está em
[`docs/levantamento-requisitos.md`](docs/levantamento-requisitos.md).

## Tecnologias

- React 19 e TypeScript;
- TanStack Start, Router e Query;
- Vite e Tailwind CSS;
- Supabase Auth, PostgreSQL, PostgREST e Edge Functions;
- Row Level Security (RLS), View, Functions, RPCs e Procedure;
- Vitest, Testing Library, ESLint e Prettier;
- Lovable e GitHub para sincronização e publicação.

## Organização

```text
├── src/                  código da aplicação e testes
├── public/               logo, PWA e recursos públicos
├── supabase/             migrations e Edge Functions operacionais
├── database/             scripts SQL organizados para a atividade
├── docs/                 requisitos, arquitetura, permissões e validações
├── .env.example          modelo das variáveis públicas
└── README.md             visão geral e execução
```

## Banco de dados

O SGBD é PostgreSQL hospedado no Supabase Cloud. As principais tabelas são:

- `clientes`, `veiculos`, `categorias_veiculo` e `servicos_lavagem`;
- `perfis` e `papeis_perfil`;
- `atendimentos`, `atendimento_lavadores` e `pagamentos`;
- `historico_status`, `historico_alteracoes` e `historico_fechamentos`;
- `fechamentos_diarios`, `itens_fechamento` e `ajustes_repasse_pendentes`.

### View: `vw_painel_atendimentos`

Consolida atendimento, cliente, veículo, serviço, participantes e pagamentos. É utilizada nas
telas de Atendimentos, Clientes e veículos, Repasses e Relatórios.

### Function: `fn_calcular_repasse`

Recebe o UUID do atendimento e retorna a parte da empresa e dos lavadores em centavos. Quando a
divisão não é exata, os centavos restantes seguem a ordem de rateio, mantendo o total correto.

### Procedure: `sp_fechar_repasses_dia`

Recebe a data, o perfil administrativo, pendências, observações e o identificador do fechamento.
Seleciona atendimentos elegíveis, valida pagamentos, chama a Function de rateio e grava os itens.
A aplicação a executa indiretamente por `rpc_fechar_repasses_dia`, pois o cliente Supabase chama
Functions PostgreSQL por RPC.

Os scripts acadêmicos estão em [`database`](database/README.md). O fluxo técnico completo está
em [`docs/arquitetura.md`](docs/arquitetura.md).

## Edge Function de convite

`supabase/functions/convidar-usuario` valida o JWT e confirma que o chamador é administrador.
Somente então usa a Admin API no servidor. Os segredos abaixo pertencem ao ambiente da função:

- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`.

A função mantém `verify_jwt = true`. Não existe cadastro público.

## Segurança

- autenticação pelo Supabase Auth;
- RLS nas tabelas do domínio;
- RPCs com validação de papel e consistência;
- `search_path` fixo nas rotinas privilegiadas;
- fechamentos confirmados imutáveis fora da reabertura auditada;
- chave administrativa restrita à Edge Function;
- `.env`, builds e arquivos temporários ignorados pelo Git.

Consulte [`docs/matriz-permissoes.md`](docs/matriz-permissoes.md) para a separação entre
administrador e lavador.
