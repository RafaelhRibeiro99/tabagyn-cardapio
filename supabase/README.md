# Configurar o acesso da loja

## Cadastro de usuários pelo painel

Na aba **Usuários**, qualquer usuário autorizado pode cadastrar e-mail e senha. A nova conta recebe as mesmas permissões completas, inclusive cadastrar outras contas, sem encerrar a sessão de quem fez o cadastro. O cadastro público deve continuar desativado.

Para ativar em um projeto existente:

1. Execute no SQL Editor: `grant select, insert on public.store_admins to service_role;` (também incluído em `setup.sql`).
2. Publique a Edge Function: `supabase functions deploy create-store-user --project-ref dwmjvpoaaqgsfssogpgk`. Execute na raiz do repositório, com a CLI autenticada. `supabase/config.toml` desativa a validação JWT legada do gateway; a função valida o token com `auth.getUser` e verifica `store_admins` antes de criar qualquer conta.
3. Publique os arquivos atualizados de `docs/` no GitHub Pages.
4. Entre com uma conta autorizada, cadastre outra em **Usuários**, entre com ela em outra sessão e confira a edição de um item e o cadastro de uma terceira conta.

A função usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, fornecidas pelo ambiente do Supabase. Nenhuma chave administrativa vai para o navegador. A criação segue a [API administrativa do Supabase](https://supabase.com/docs/reference/javascript/auth-admin-createuser). Contas criadas pelo painel já ficam com e-mail confirmado. Se a concessão de acesso falhar, a função tenta desfazer a conta e informa quando for necessária correção manual.

Testes simulados: `node tests/admin.cjs` e `node tests/create_store_user.cjs`. A publicação e o teste no Supabase real são necessários para disponibilizar o cadastro online.

## Configuração inicial

O site continua no GitHub Pages. O painel usa Supabase Auth; apenas usuários cadastrados em `store_admins` podem salvar o catálogo e enviar fotos. Criar uma conta no Auth, por si só, não concede acesso administrativo.

1. No Supabase, abra **SQL Editor → New query**, cole todo o conteúdo de `setup.sql` e clique em **Run**. O script cria as tabelas, permissões, armazenamento de imagens e importa o catálogo atual sem sobrescrever um catálogo existente.
2. Abra **Authentication → Users → Add user → Create new user**. Cadastre seu e-mail e uma senha forte. Para a conta criada manualmente, marque a confirmação de e-mail se essa opção aparecer. Não compartilhe a senha no chat.
3. No SQL Editor, execute `authorize-admin.sql` depois de substituir `TROQUE_PELO_SEU_EMAIL` pelo mesmo e-mail. Somente esse usuário será autorizado como administrador.
4. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**. O painel não precisa de cadastro público.
5. Configure a URL exata e a Publishable key em `docs/supabase-config.js`. Nunca use Secret key ou service_role no site.
6. Antes de ativar, teste `docs/admin.html`: entrar, criar/editar um item, enviar uma foto, conferir a persistência e sair. Confirme que um acesso sem login não pode salvar.
7. Somente após o banco estar pronto, altere `enabled` para `true` em `docs/supabase-config.js` e publique no GitHub. A partir daí, o catálogo vem do Supabase e `cardapio.js` deixa de ser a fonte dos cadastros. Clientes precisam atualizar a página para buscar mudanças.

O catálogo público não contém informações de autenticação. As imagens são públicas e limitadas a JPG, PNG e WebP de até 5 MB. O painel converte fotos em JPEG com até 1200 pixels e remove metadados pela conversão no navegador. Imagens substituídas permanecem no Storage para não quebrar páginas já abertas; a limpeza é manual.

Uma alteração concorrente não sobrescreve o catálogo silenciosamente: o painel solicita atualizar a lista. Em falha de conexão, ele mantém o formulário aberto; confira a lista antes de repetir um salvamento cujo resultado não foi confirmado.

Não há recuperação de senha por e-mail implementada no painel. A administração da conta pode ser feita no dashboard Supabase. Mantenha acesso à conta proprietária do projeto.

Validação local: `node tests/session_cart.cjs` e `node tests/catalog_loader.cjs`. As permissões e o upload também precisam ser verificados no projeto Supabase real antes da ativação.
