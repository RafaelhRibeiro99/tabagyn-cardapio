# TABAGYN — cardápio e acesso da loja

Site em HTML, CSS e JavaScript no GitHub Pages, com Supabase para catálogo, login e fotos. Não usa Python nem servidor local.

- Cardápio: https://rafaelhribeiro99.github.io/tabagyn-cardapio/
- Acesso da loja: https://rafaelhribeiro99.github.io/tabagyn-cardapio/admin.html

## Atualizar o cardápio

Na aba **Usuários** do painel, cadastre novas contas por e-mail e senha. Todas recebem acesso completo para alterar produtos, essências, configurações e cadastrar outros usuários. Para disponibilizar esse recurso online, publique a função `create-store-user` conforme [as instruções do Supabase](supabase/README.md#cadastro-de-usuários-pelo-painel).

Abra **Acesso da loja**, no rodapé, e entre com o e-mail e a senha criados no Supabase. Em **Produtos** e **Essências**, cadastre ou edite os itens, preços, disponibilidade e fotos. Em **Configurações**, altere WhatsApp e modo de demonstração. Clique em **Salvar**; clientes verão a atualização ao abrir ou atualizar o cardápio.

Sessões precisam de essências vinculadas para permitir uma mistura de 100%. Misturas diferentes ficam separadas no carrinho. O painel aceita JPG, PNG e WebP de até 5 MB e 20 megapixels, convertidos para JPEG de até 1200 pixels. Fotos antigas ficam no Storage até limpeza manual.

O catálogo ativo vem de `store_catalog` no Supabase. Editar `docs/cardapio.js` não altera o catálogo online enquanto `enabled: true` estiver em `docs/supabase-config.js`. Esse arquivo local é uma cópia inicial para uso estático, não um backup atualizado do banco.

## Publicar

Envie as alterações para `main`. Em **Settings → Pages**, mantenha **Deploy from a branch → main → /docs**. Não há comando de build. Publique somente `docs/`.

## Configuração do Supabase

Consulte [supabase/README.md](supabase/README.md). A configuração pública fica em `docs/supabase-config.js`. Uma conta só pode editar se estiver autorizada em `store_admins`; criar um usuário no Auth não basta. Desative cadastros públicos em **Authentication → Sign In / Providers → Allow new users to sign up**.

A URL e a Publishable key são públicas. Nunca coloque senhas, Secret keys ou service_role no site. `.env`, `.venv` e `data/` continuam ignorados. O antigo banco local está preservado em `data/` e não é usado pelo site.

O painel guarda o login na sessão da aba e oferece **Sair**. A recuperação de conta é administrada no dashboard do Supabase. Em falha de conexão ou conflito com outro acesso, confira o catálogo antes de repetir a alteração. Se o catálogo online não puder ser carregado, o site bloqueia pedidos em vez de usar preços antigos.

## Pedidos

O cliente informa a mesa e abre o pedido no WhatsApp. Nome e observações são opcionais. O carrinho é zerado ao abrir o WhatsApp; o cliente ainda precisa revisar e enviar a mensagem. O site não armazena pedidos.

## Verificação

Execute `node tests/session_cart.cjs`, `node tests/catalog_loader.cjs` e `node tests/admin.cjs`. O teste do painel usa um serviço simulado; login real, upload e persistência devem ser conferidos também no Supabase. Node só é necessário para testes.
