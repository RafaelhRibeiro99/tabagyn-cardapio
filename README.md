# TABAGYN — cardápio estático

HTML, CSS e JavaScript, sem Python, instalação ou banco de dados. Abra `docs/index.html` no navegador para visualizar localmente.

## Publicar no GitHub Pages

1. Envie as alterações ao seu repositório no GitHub.
2. Abra **Settings → Pages**.
3. Em **Source**, selecione **Deploy from a branch**.
4. Escolha a branch que recebeu os arquivos (normalmente `main`) e a pasta **/docs**. Clique em **Save**.
5. Aguarde e abra o endereço informado pelo GitHub, normalmente `https://SEU-USUARIO.github.io/TABAGYN/`.

Não há comando de build. Publique somente a pasta `docs/`.

## Atualizar pelo GitHub

Abra `docs/cardapio.js`, clique no lápis, edite e use **Commit changes**. Aguarde a publicação e atualize o navegador. A permissão de edição fica no GitHub; o site não tem painel administrativo.

- `whatsapp`: país + DDD + número, somente dígitos.
- `demonstracao`: `true` identifica o catálogo como teste; `false` desativa o aviso.
- `categorias`: cada categoria tem `id`, `nome` e `descricao`.
- `produtos`: cada produto tem `id` único, `categoria` correspondente ao ID da categoria, `nome`, `descricao`, `preco` em centavos (1250 = R$ 12,50), `disponivel`, `sessao` e `imagem`.
- `essencias`: cada essência tem `id` único, `marca`, `sabor`, `disponivel`, `imagem` e `sessoes`, uma lista de IDs dos produtos de sessão aos quais está vinculada.

Para adicionar itens, copie um objeto existente e atribua um novo ID. Separe objetos com vírgulas e preserve aspas, colchetes e chaves. Ao mudar um ID, atualize também seus vínculos.

Envie fotos JPG, PNG ou WebP para `docs/uploads/` com **Add file → Upload files**. No produto ou essência, use `imagem: "./uploads/nome-da-foto.jpg"` (mantendo as aspas na chave, como no arquivo). Use fotos compactas e nomes sem espaços. O valor `null` usa a ilustração padrão.

Sessões precisam de `sessao: true` e essências disponíveis vinculadas ao seu ID. Sem essências, a adição fica bloqueada. A mistura precisa completar 100%; misturas diferentes ficam separadas no carrinho. Cadastre somente essências sem tabaco e sem nicotina.

## Pedidos e dados

O cliente informa a mesa e finaliza pelo WhatsApp; nome e observações são opcionais. Ele revisa e envia a mensagem. A loja confirma disponibilidade e valores. O site não armazena pedidos; recarregar a página reinicia o carrinho.

O catálogo foi migrado do banco local, incluindo produtos, essências e fotos referenciadas. `data/` permanece como backup privado e não é usada pelo site. `.env`, `.venv` e `data/` continuam ignorados pelo Git. Nunca envie credenciais ou bancos para `docs/`: seu conteúdo é público.

## Verificação

Com Node.js, execute `node tests/session_cart.cjs` e `node --check docs/cardapio.js`. Node só é necessário para esses testes, não para publicar ou usar o site.

Documentação: [criar um site no Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site). Confira também as [restrições de uso comercial](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) para avaliar a adequação à loja. Os mesmos arquivos funcionam em outras hospedagens estáticas.