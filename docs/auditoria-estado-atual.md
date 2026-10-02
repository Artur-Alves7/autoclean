# Auditoria do estado atual

Data da auditoria: 2 de outubro de 2026.

## Escopo e base verificada

Esta etapa foi exclusivamente de inspeção e documentação. Não houve alteração
de código da aplicação, banco, migrations, políticas RLS, Edge Functions ou
dados no Supabase Cloud. Também não houve push, deploy ou publicação no
Lovable.

A auditoria foi executada na branch local `codex/etapa-1-auditoria`, criada a
partir da `main` no commit
`cad67764d262d1c277f6cfd76e3cd1df691a356b` (`Atualiza interface do LavaClean
com identidade Auto Clean`). A clonagem HTTPS não pôde usar a autenticação do
conector GitHub no terminal; por isso, o checkout Git local foi reconstruído
como raso a partir da exportação disponível e dos metadados do commit.

A correspondência com a `main` foi confirmada por dois identificadores:

- commit local e remoto: `cad67764d262d1c277f6cfd76e3cd1df691a356b`;
- árvore Git local e remota: `0cbb2bc3fee85113d0acde2b6f753d400631920f`.

Os commits mais recentes consultados no GitHub foram:

1. `cad6776` — Atualiza interface do LavaClean com identidade Auto Clean;
2. `9a39932` — Corrige CORS e respostas HTTP do convite de usuários;
3. `a9dbbf2` — Adiciona tipos do runtime da Edge Function;
4. `e3fc4c1` — Adapta convite ao runtime atual de Edge Functions;
5. `763e3b2` — Documenta arquitetura, permissões e testes críticos.

## Estado encontrado

O projeto contém as rotas de administrador e lavador, componentes dos fluxos
de atendimento, clientes e veículos, usuários, configurações, pagamentos,
fechamentos e repasses. A integração com Supabase está separada entre cliente,
middleware e código de servidor. Há três migrations versionadas, uma Edge
Function de convite e documentação de permissões e validação do convite.

A suíte automatizada possui cinco arquivos de testes:

- roteamento e proteção das áreas autenticadas;
- normalização e payload de placa;
- contrato HTTP e autorização da função de convite;
- interface operacional e restrições visíveis por papel;
- regras de pagamentos, rateio e transições de status.

Os testes atuais usam simulações locais. Eles não comprovam o estado das
migrations, RLS, configurações de Auth, entrega de e-mail, Edge Function ou
dados no Supabase Cloud.

## Verificações executadas

| Verificação    | Resultado | Evidência                                             |
| -------------- | --------- | ----------------------------------------------------- |
| `vitest run`   | Aprovada  | 5 arquivos e 51 testes aprovados                      |
| `vite build`   | Aprovada  | cliente, SSR e bundle Nitro gerados                   |
| `eslint .`     | Reprovada | 642 erros e 6 avisos em 13 arquivos                   |
| `tsc --noEmit` | Reprovada | 1 erro de resolução do import remoto da Edge Function |
| comparação Git | Aprovada  | commit e árvore iguais aos da `main` remota           |

O build concluiu com avisos já presentes:

- bundle principal do cliente com aproximadamente 577 kB, acima do limite de
  aviso de 500 kB;
- recomendação para substituir o plugin `vite-tsconfig-paths` pela resolução
  nativa do Vite;
- `inlineDynamicImports` ignorado na etapa Nitro quando `codeSplitting` está
  definido.

## Falhas preexistentes separadas

O lint global não foi corrigido nesta etapa para manter o commit estritamente
documental. A distribuição encontrada foi:

- 641 erros de `prettier/prettier` em sete arquivos;
- 1 erro `prefer-const` em `previewAuthStorage.ts`;
- 6 avisos `react-refresh/only-export-components` em componentes reutilizáveis
  de interface.

O maior volume está no arquivo gerado `src/integrations/supabase/types.ts`, com
545 erros de formatação. Os demais erros de formatação estão em arquivos da
integração Supabase, `src/lib/acesso.ts` e na rota autenticada.

A checagem TypeScript falha somente porque o compilador do front-end não
resolve o import Deno por URL de
`supabase/functions/convidar-usuario/handler.ts`. O build e os testes passam,
mas a Etapa 2 deve decidir uma configuração de tipos que valide a função sem
mascarar erros do front-end.

## Pendências confirmadas

1. **Convites e deploy:** o código possui CORS, validação do JWT e
   `verify_jwt = true`, mas o deploy e as respostas reais da função no Supabase
   Cloud ainda não foram confirmados. A documentação do convite ainda registra
   uma base anterior e 45 testes, portanto precisa ser atualizada na Etapa 2.
2. **Primeiro acesso e senha:** a interface atual implementa apenas login com
   `signInWithPassword`. Não foram encontradas telas nem chamadas para
   recuperação de senha ou definição de senha após convite. A necessidade e o
   fluxo correto devem ser resolvidos na Etapa 3 com as configurações reais do
   Supabase Auth.
3. **Fluxos reais:** atendimento, pagamento, entrega, fechamento e repasses têm
   testes locais, mas não foram validados ponta a ponta com uma sessão real e
   dados fictícios controlados no ambiente Cloud.
4. **Segurança real:** a matriz documentada descreve permissões, porém ainda
   falta verificar RLS e RPCs com usuários reais dos dois papéis. O repositório
   não prova que o Cloud contém exatamente as políticas versionadas.
5. **Qualidade estática:** o lint global e o typecheck global não estão verdes.
   Esses débitos devem ser tratados na etapa a que cada arquivo pertence, sem
   misturar correções não relacionadas.
6. **Documentação de banco:** o README instrui a aplicar migrations que, segundo
   o estado informado do projeto, já foram aplicadas. A redação deve distinguir
   instalação nova de ambiente já provisionado, sem reexecutar migrations.
7. **Arquivo de ambiente:** `.env` está versionado apesar da orientação do
   README. Foram inspecionados apenas os nomes das variáveis: projeto, URL e
   chave publicável do Supabase; não há variável de `service_role` nesse
   arquivo. Na Etapa 7 ou 8 deve-se decidir entre removê-lo do controle de
   versão e fornecer um `.env.example`, sem registrar valores secretos.
8. **CI:** não há workflow versionado em `.github/workflows`. A adoção de CI
   deve aguardar a correção ou o tratamento explícito das falhas preexistentes
   para não criar uma verificação permanentemente vermelha.

## Ordem acordada para continuidade

A próxima etapa é a revisão da Edge Function `convidar-usuario`. Nenhuma ação
da Etapa 2 foi executada nesta auditoria. Cada etapa posterior deve manter um
commit próprio, usar somente dados fictícios e distinguir testes automatizados
de validações reais no Supabase Cloud.
