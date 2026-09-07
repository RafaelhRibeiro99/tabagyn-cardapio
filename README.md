# TABAGYN — cardápio com administração simples

A aplicação usa FastAPI e um arquivo SQLite. O cliente monta o carrinho e envia a mensagem pelo WhatsApp; o administrador altera preços, cadastra produtos e envia fotos pelo navegador, inclusive pelo celular. Não usa PostgreSQL e não armazena pedidos.

O cardápio atende pedidos para consumo na TabaGyn, sem entrega. **Verificar carrinho** abre os itens, quantidades e total em uma janela separada. A mesa é obrigatória para finalizar; nome e observações são opcionais. **Finalizar pedido** abre a mensagem no WhatsApp da loja, configurado inicialmente como **(62) 99211-4211** (`5562992114211`). O cliente revisa a mensagem e toca em enviar.

## Abrir

No PowerShell, na pasta do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Cardápio: http://127.0.0.1:8000/ · Administração: http://127.0.0.1:8000/admin

O servidor deve ficar aberto. O cardápio depende do FastAPI para carregar os arquivos em `/assets`, o catálogo atualizado e o painel. Usar `http.server` ou abrir o HTML diretamente não substitui esse servidor.

## Configurar

Entre em `/admin`. Use **Novo produto** para cadastrar, **Editar** para alterar nome, categoria, preço, descrição, foto ou disponibilidade. JPG, PNG e WebP de até 5 MB e 20 megapixels são aceitos; as fotos são convertidas em JPEG, redimensionadas e ficam sem metadados da câmera. As categorias disponíveis são Sessões, Bebidas, Drinks, Esquine e Doces.

Em **Configurações da loja**, altere o WhatsApp e desmarque a demonstração quando os produtos e preços reais estiverem cadastrados. As alterações são salvas imediatamente; clientes que já estão com a página aberta precisam atualizá-la.

Em uma instalação nova, defina `ADMIN_USERNAME` e `ADMIN_PASSWORD` no ambiente privado antes de iniciar pela primeira vez. A senha será armazenada somente como hash Argon2. Depois da criação, essas variáveis podem ser removidas. Elas não sobrescrevem um administrador existente. Nenhuma senha é incluída nos arquivos públicos.

O cliente precisa enviar a mensagem no WhatsApp. A loja confirma disponibilidade e valores. O site não confirma automaticamente pedidos nem pagamentos.

## Dados

O carrinho e os campos existem somente na página aberta. Recarregar a página reinicia o carrinho. Não há histórico no site nem rotina de exclusão após alguns dias. Mensagens enviadas ficam no WhatsApp, conforme as configurações e ações dos participantes.

O catálogo, o administrador e as fotos ficam em `data/` (ou `DATA_DIR`). Faça backup dessa pasta com o servidor parado. Não apague essa pasta para atualizar o sistema.

## Publicar

Guarde o código no GitHub e use uma hospedagem com Python ou Docker, HTTPS e disco persistente. O painel não funciona em hospedagem apenas estática. O `Dockerfile` está pronto e escuta na porta 8000. Monte um volume persistente em `/data`; use uma única instância do aplicativo para esse banco SQLite.

Na hospedagem, configure:

- `DATA_DIR=/data` (ou o caminho do disco persistente).
- `SECRET_KEY`: chave aleatória com pelo menos 32 caracteres, estável entre reinicializações.
- `COOKIE_SECURE=true` para acesso por HTTPS.
- `ADMIN_USERNAME` e `ADMIN_PASSWORD`: somente para a primeira inicialização.

O comando de início sem Docker é `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`. Configure a porta exigida pela hospedagem. Para levar os dados locais, copie o conteúdo de `data/` para o volume persistente com ambos os servidores parados. Nunca coloque esse conteúdo no repositório público. Exponha o serviço por HTTPS através da hospedagem; o servidor local usa HTTP somente para teste.

O GitHub Pages não permite sites destinados principalmente a facilitar transações comerciais: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

Não publique `.env`, `.venv` ou `data/` no GitHub. O `.gitignore` e o `.dockerignore` já excluem esses dados. Os arquivos antigos `app/routers`, `app/database.py`, `app/models.py`, `init_db.py` e `create_admin.py` não são usados pela nova aplicação; não execute os antigos inicializadores PostgreSQL.

## Verificação

Execute `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`. Os testes iniciam um servidor isolado, com banco temporário, e verificam autenticação, proteção de alterações, preços, fotos, configurações e persistência após reiniciar. Não enviam mensagens pelo WhatsApp e não alteram o catálogo da loja.

## Sessões e essências

Produtos da categoria **Sessões** abrem a montagem de mistura; as outras categorias continuam com adição direta ao carrinho.

Em **Administração → Essências**, cadastre marca, sabor, foto e disponibilidade. Marque em quais sessões a essência pode aparecer. Uma essência sem sessões marcadas não aparece para clientes; uma essência indisponível também fica oculta. Este cadastro é destinado às essências sem tabaco e sem nicotina confirmadas para a loja.

O cliente informa porcentagens inteiras de 1 a 100 para os sabores escolhidos. O total não ultrapassa 100%, e somente uma mistura completa pode ser adicionada. Marca, sabor e porcentagem aparecem no carrinho e na mensagem do WhatsApp. Misturas diferentes da mesma sessão ficam em linhas separadas; misturas iguais somam quantidade. As essências não alteram o preço da sessão.

Cadastre as essências reais antes de receber pedidos de sessão: sem opções vinculadas, a janela informa que não há essências disponíveis e bloqueia a adição. Cadastros e vínculos ficam no mesmo banco em `DATA_DIR`, junto ao catálogo existente.

Teste das interações do carrinho: `node tests/session_cart.cjs`.
