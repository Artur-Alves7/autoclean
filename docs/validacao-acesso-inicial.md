# Login, convite e acesso inicial

Revisão preparada em 02/10/2026 para a Etapa 3. Esta etapa implementa a
interface que faltava para primeiro acesso e recuperação de senha, mas não
envia convites reais, não usa contas reais, não altera dados no Supabase Cloud
e não faz push, deploy ou publicação no Lovable.

## Implementação

- A tela de login oferece o link **Esqueci minha senha**.
- `/recuperar-senha` chama `resetPasswordForEmail` e sempre mostra uma
  confirmação neutra após uma resposta bem-sucedida, sem revelar se a conta
  existe.
- `/definir-senha` exige sessão válida, senha com ao menos oito caracteres e
  confirmação idêntica; ao salvar, chama `updateUser` e remove a marca de
  primeiro acesso pendente.
- O convite grava `primeiro_acesso_pendente: true` nos metadados e informa
  `/definir-senha?origem=convite` como destino. Somente origens HTTPS ou HTTP
  local são montadas pelo handler; a lista de URLs permitidas do Supabase Auth
  continua sendo a validação final.
- Usuários autenticados com primeiro acesso pendente são encaminhados para a
  definição de senha antes das áreas protegidas.
- Perfil, papel, autorização e destino final continuam sendo consultados pelos
  mecanismos existentes. O metadado de primeiro acesso controla a experiência
  de entrada e não substitui RLS nem autorização por papel.

## Evidência automatizada e limites

Os testes locais usam URLs, usuários e credenciais simulados. Eles verificam:

- reconhecimento dos retornos `invite` e `recovery`;
- validação local da nova senha;
- marca de primeiro acesso e destino enviados pela função de convite;
- descarte de uma origem HTTP externa para o redirecionamento;
- regressão da suíte existente, TypeScript, lint direcionado e build.

Esses testes não comprovam entrega de e-mail, templates, SMTP, Site URL, lista
de redirect URLs, sessão criada pelo link hospedado, papéis/RLS no Cloud ou
acesso real dos usuários. Os itens abaixo permanecem desmarcados até execução
manual com evidência.

Resultados executados nesta revisão:

- suíte completa: 6 arquivos e 59 testes aprovados;
- ESLint dos arquivos TypeScript alterados: aprovado sem erros ou avisos;
- `tsc --noEmit`: aprovado;
- build Vite/Nitro: aprovado, mantendo apenas os avisos já documentados de
  tamanho do bundle, resolução de caminhos e opção do empacotador;
- prévia local em navegador: login → recuperação aprovado, estado de link
  inválido aprovado, foco por teclado visível e viewport móvel real de 390 px
  sem rolagem horizontal; nenhum erro foi registrado no console;
- nenhum formulário da prévia foi enviado e nenhum teste autenticado real foi
  executado.

## Preparação manual no Supabase

Antes do teste, no projeto correto do Supabase:

1. Em **Authentication > URL Configuration**, confira o Site URL do ambiente e
   permita os destinos usados no teste, incluindo a origem da aplicação seguida
   de `/definir-senha`. Para desenvolvimento local, permita também a URL local
   exata. Não use curingas mais amplos que o necessário.
2. Confira os templates de **Invite user** e **Reset password**, mantendo o link
   gerado pelo Supabase. Verifique remetente/SMTP e limites de envio sem copiar
   secrets para o repositório.
3. Faça o redeploy manual da função `convidar-usuario` depois que este commit
   estiver disponível no ambiente autorizado. O handler anterior não envia a
   marca nem o novo `redirectTo`. Esta etapa não fez o deploy.
4. Use três caixas controladas e dados totalmente fictícios: dois
   administradores já provisionados (`Administrador Teste A` e
   `Administrador Teste B`) e um e-mail novo para `Lavador Teste`.
5. Use janela anônima ou perfis separados para não confundir as sessões. Nunca
   registre senhas, tokens, cookies ou links mágicos como evidência.

## Roteiro de validação manual

### Administradores

- [ ] Administrador Teste A entra com senha válida e é encaminhado a `/admin`.
- [ ] Administrador Teste B entra com senha válida e é encaminhado a `/admin`.
- [ ] Cada administrador acessa Usuários; as ações administrativas esperadas
      ficam disponíveis.
- [ ] Um deles envia um único convite para `Lavador Teste`; a interface mostra
      sucesso e a chamada termina com status 200.
- [ ] O outro administrador confirma que o perfil fictício aparece com papel
      lavador e não ganha permissões administrativas.

### Convite e primeiro acesso do lavador

- [ ] A caixa de teste recebe o convite; remetente, assunto e link correspondem
      ao projeto esperado.
- [ ] O link aberto em sessão separada chega a `/definir-senha` com a indicação
      **Primeiro acesso**, sem cair diretamente no painel.
- [ ] Senha curta é recusada; confirmações diferentes são recusadas.
- [ ] Uma senha fictícia válida é salva e a tela confirma que o acesso está
      pronto.
- [ ] **Continuar** leva a `/lavador`; telas e ações administrativas não ficam
      disponíveis.
- [ ] Após sair, o lavador entra com a nova senha e volta a `/lavador`, sem ser
      solicitado a definir a senha novamente.

### Recuperação de senha

- [ ] Na tela de login, **Esqueci minha senha** abre `/recuperar-senha`.
- [ ] Um e-mail não cadastrado recebe a mesma confirmação visual que um e-mail
      cadastrado; não há enumeração de conta na interface.
- [ ] O lavador solicita recuperação e recebe o e-mail de teste.
- [ ] O link abre `/definir-senha` com **Recuperação de acesso**.
- [ ] Após salvar uma nova senha fictícia, a senha anterior deixa de autenticar
      e a nova leva a `/lavador`.
- [ ] Um link expirado ou já consumido mostra o estado **Link inválido ou
      expirado**, sem liberar o painel.

### Permissões mínimas

- [ ] Administradores continuam acessando `/admin` e o gerenciamento de
      usuários.
- [ ] Lavador é redirecionado para `/lavador` e não consegue entrar em `/admin`
      digitando a URL diretamente.
- [ ] Lavador não consegue chamar a função de convite: espera-se 403 antes da
      validação do corpo.
- [ ] Sessão ausente é redirecionada para o login nas rotas protegidas.

## Registro dos resultados manuais

Preencher somente depois de executar. Use data/hora aproximada, ambiente,
papel e resultado; não inclua identificadores pessoais nem dados secretos.

| Caso                           | Ambiente | Resultado     | Evidência segura/observação |
| ------------------------------ | -------- | ------------- | --------------------------- |
| Login Admin A                  | pendente | não executado | —                           |
| Login Admin B                  | pendente | não executado | —                           |
| Envio e recebimento do convite | pendente | não executado | —                           |
| Primeiro acesso do lavador     | pendente | não executado | —                           |
| Novo login do lavador          | pendente | não executado | —                           |
| Recuperação de senha           | pendente | não executado | —                           |
| Matriz mínima de permissões    | pendente | não executado | —                           |

## Pendência recebida para etapa posterior

Durante esta etapa foi informado o erro
`duplicate key value violates unique constraint "fechamentos_diarios_data_operacao_key"`.
Ele indica tentativa de inserir mais de um fechamento para a mesma data de
operação. Como pertence ao fechamento diário, foi registrado para reprodução,
diagnóstico e correção exclusiva na Etapa 6, evitando misturar alterações e
commits. O erro ainda não foi reproduzido nem corrigido nesta etapa.

Atualização da Etapa 6: a causa foi confirmada por inspeção e corrigida na
migration aditiva `20261002013000_fechamento_diario_idempotente.sql`. A
migration ainda depende de revisão e aplicação manual no Supabase Cloud; não
foi executada automaticamente.

## Próximos passos manuais

1. Revisar e integrar o commit desta etapa na branch destinada ao teste.
2. Autorizar e executar separadamente o redeploy de `convidar-usuario`.
3. Configurar URLs/templates no painel sem compartilhar secrets.
4. Publicar ou iniciar o front-end no ambiente autorizado.
5. Executar o roteiro acima e registrar resultados reais antes de declarar o
   fluxo validado em produção.

Referências oficiais: [senhas e recuperação](https://supabase.com/docs/guides/auth/passwords),
[gerenciamento de usuários e convites](https://supabase.com/docs/guides/auth/users)
e [atualização do usuário](https://supabase.com/docs/reference/javascript/auth-updateuser).
