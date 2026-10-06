# Documentação do Auto Clean

Este diretório reúne requisitos e documentação técnica do sistema. Nenhum arquivo deve conter
dados reais de clientes, senhas, tokens ou chaves administrativas.

## Arquitetura e segurança

- [`arquitetura.md`](arquitetura.md): camadas, integrações e fluxo aplicação-banco-resultado.
- [`matriz-permissoes.md`](matriz-permissoes.md): permissões de administrador e lavador.
- [`levantamento-requisitos.md`](levantamento-requisitos.md): requisitos funcionais, não
  funcionais, regras de negócio e critérios de aceite do sistema.

## Banco de dados

Os scripts operacionais permanecem em `supabase/migrations`, na ordem em que evoluíram o banco.
As cópias acadêmicas de tabelas, View, Function e Procedure ficam em
[`database`](../database/README.md). Esses arquivos não devem ser executados na produção.
