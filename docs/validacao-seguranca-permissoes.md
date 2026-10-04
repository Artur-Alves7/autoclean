# Validação de segurança e permissões

## Escopo da etapa 7

Foram revisados o roteamento, a exposição de ações nas telas, as consultas do cliente, as políticas RLS e as rotinas `SECURITY DEFINER`. A revisão é estática e automatizada no repositório: nenhum SQL foi executado no Supabase Cloud e nenhum dado de produção foi acessado.

## Resultado da revisão

| Cenário                             | Administrador               | Lavador                       | Controle efetivo                |
| ----------------------------------- | --------------------------- | ----------------------------- | ------------------------------- |
| Abrir área administrativa           | Permitido                   | Redirecionado para `/lavador` | loader de rota                  |
| Ver fila ativa                      | Permitido                   | Permitido                     | `lc_pode_ver_atendimento` + RLS |
| Ver atendimento entregue/cancelado  | Permitido                   | Apenas se participou          | `lc_pode_ver_atendimento` + RLS |
| Criar e avançar atendimento         | Permitido                   | Permitido enquanto visível    | RPC transacional                |
| Corrigir participantes              | Apenas em atendimento ativo | Negado                        | `rpc_definir_participantes`     |
| Alterar cliente/veículo             | Permitido                   | Negado                        | RLS administrativa              |
| Gerenciar categoria/serviço/usuário | Permitido                   | Negado                        | RLS ou RPC administrativa       |
| Revisar/confirmar fechamento        | Permitido                   | Negado                        | RPC administrativa              |
| Ver itens de repasse                | Todos                       | Apenas os próprios            | RLS de `itens_fechamento`       |

Foram corrigidas três brechas de defesa em profundidade:

- a escrita direta em `atendimento_lavadores` foi removida do papel `authenticated`;
- a correção de participantes agora exige administrador, atendimento ativo, lista sem duplicidade e lavadores ativos com o papel correto;
- preço e pagamentos enviados à RPC de avanço são aceitos somente na entrega, com valor final e parcelas positivos e soma exata em centavos.

A execução de `fn_calcular_repasse` também foi explicitamente removida de `public` e concedida somente a `authenticated`. Todas as funções `SECURITY DEFINER` alteradas mantêm `search_path` fixo.

## Evidências automatizadas locais

O arquivo `src/test/seguranca.test.ts` verifica as restrições acima e as políticas essenciais de leitura e escrita. Esses testes analisam o SQL versionado; eles não substituem um teste integrado contra um projeto Supabase.

Execuções de 2 de outubro de 2026:

- `vitest run`: 8 arquivos e 95 testes aprovados;
- `eslint src/test/seguranca.test.ts`: aprovado sem avisos;
- `vite build`: aprovado; permaneceram apenas os avisos já conhecidos sobre tamanho do chunk principal, `vite-tsconfig-paths` e `inlineDynamicImports`;
- `eslint .`: falhou em arquivos preexistentes fora desta etapa, com 639 erros de formatação e 6 avisos de Fast Refresh; o arquivo TypeScript alterado nesta etapa passou isoladamente;
- Prettier: documentação e teste alterados aprovados; não há parser SQL configurado no projeto.

A migration não foi executada localmente porque não há instância PostgreSQL/Supabase disponível, nem no Cloud, conforme a restrição da etapa. A validação real de RLS e das respostas permitidas/negadas continua pendente no roteiro abaixo.

## Validação manual pendente no Supabase

Depois de revisar e aplicar **somente** `20261002014000_reforco_permissoes.sql` em um ambiente seguro, use contas fictícias e confirme:

1. Administrador acessa `/admin`; lavador é redirecionado para `/lavador`.
2. Ambos veem a fila ativa e conseguem criar/avançar um atendimento operacional.
3. Lavador não vê botões administrativos e recebe negação ao chamar diretamente as RPCs administrativas.
4. Lavador não consegue inserir, alterar ou excluir diretamente `atendimento_lavadores`.
5. Administrador corrige participantes de um atendimento ativo; a mesma ação é negada para atendimento entregue ou cancelado.
6. A correção rejeita perfil inativo, administrador sem papel de lavador e lavador repetido.
7. A RPC de avanço rejeita preço ou pagamentos ao iniciar, marcar como pronto ou cancelar.
8. A entrega rejeita valor zero/negativo, parcela zero/negativa, lista vazia e soma divergente; aceita pagamento único ou dividido com soma exata.
9. Lavador participante consulta seu atendimento concluído e seus próprios repasses, mas não os de outro lavador.
10. Somente administrador altera cliente/veículo, categoria/serviço, usuário, atendimento entregue e fechamento.

Registrar data, ambiente, perfil fictício, ação e resultado observado. Não colocar tokens, senhas, e-mails pessoais ou dados reais de clientes no repositório.
