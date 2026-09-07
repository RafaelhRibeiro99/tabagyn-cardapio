(() => {
  "use strict";
  const config = window.CARDAPIO;
  const cart = new Map();
  const $ = id => document.getElementById(id);
  const money = cents => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const products = config.produtos.filter(p => Number.isSafeInteger(p.preco) && p.preco >= 0);
  const essences = config.essencias || [];
  const isSession = p => p.sessao || config.categorias.find(c => c.id === p.categoria)?.nome === "Sessões";
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  let feedbackTimer;
  function feedback(message) {
    $("feedback").textContent = message;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { $("feedback").textContent = ""; }, 2400);
  }
  function addProduct(product, flavors = []) {
    if (!product.disponivel) { feedback(`${product.nome} está indisponível no momento.`); return false; }
    const key = JSON.stringify([product.id, flavors.map(f => [f.id, f.percentage]).sort((a,b) => a[0].localeCompare(b[0]))]);
    const item = cart.get(key) || {key, product, quantity:0, flavors};
    if (item.quantity >= 99) { feedback("Limite de 99 unidades por mistura ou produto."); return false; }
    item.quantity++;
    cart.set(key, item);
    renderCart();
    feedback(`${product.nome} adicionado ao pedido.`);
    return true;
  }
  function change(key, delta) {
    const item = cart.get(key);
    if (!item) return;
    item.quantity = Math.max(0, Math.min(99, item.quantity + delta));
    if (!item.quantity) cart.delete(key);
    renderCart();
  }
  function entries() { return [...cart.values()]; }
  function total() { return entries().reduce((sum, item) => sum + item.product.preco * item.quantity, 0); }
  const flavorText = f => `${f.marca} · ${f.sabor}: ${f.percentage}%`;
  function renderCart() {
    const focusKey = document.activeElement?.dataset.cartControl;
    $("items").replaceChildren();
    if (!cart.size) $("items").append(element("p", "Seu pedido começa aqui. Adicione algo do cardápio.", "empty"));
    for (const { key, product: p, quantity, flavors } of entries()) {
      const row = element("div", undefined, "cart-row");
      const info = element("div");
      info.append(element("strong", p.nome), element("small", money(p.preco * quantity)));
      if (flavors.length) info.append(element("small", flavors.map(flavorText).join(" + "), "cart-flavors"));
      const controls = element("div", undefined, "quantity");
      for (const [symbol, delta, label] of [["−", -1, "Diminuir"], ["+", 1, "Aumentar"]]) {
        const button = element("button", symbol);
        button.type = "button";
        button.setAttribute("aria-label", `${label} quantidade de ${p.nome}`);
        button.dataset.cartControl = `${key}:${delta}`;
        button.disabled = delta === 1 && quantity >= 99;
        button.addEventListener("click", () => change(key, delta));
        controls.append(button);
        if (delta === -1) controls.append(element("span", String(quantity)));
      }
      row.append(info, controls); $("items").append(row);
    }
    $("count").textContent = entries().reduce((sum, item) => sum + item.quantity, 0);
    $("total").textContent = money(total());
    $("mobileCount").textContent = $("count").textContent;
    $("mobileTotal").textContent = money(total());
    $("mobileCart").hidden = false;
    $("finishOrder").disabled = !cart.size;
    $("status").textContent = "";
    $("clear").disabled = !cart.size;
    if (focusKey) {
      const replacement = [...document.querySelectorAll("[data-cart-control]")].find(n => n.dataset.cartControl === focusKey);
      (replacement || $("name")).focus();
    }
  }
  let cartTrigger;
  for (const id of ["openCart", "mobileCart"]) {
    $(id).addEventListener("click", () => {
      cartTrigger = $(id);
      $("cartDialog").showModal();
      document.body.classList.add("mix-open");
    });
  }
  $("closeCart").addEventListener("click", () => $("cartDialog").close());
  $("cartDialog").addEventListener("close", () => {
    document.body.classList.remove("mix-open"); cartTrigger?.focus();
  });
  const dialog = $("sessionDialog");
  let sessionProduct = null, trigger = null, choices = [];
  function selection() { return choices.filter(c => c.check.checked); }
  function percentage(c) { return Number(c.input.value); }
  function mixValid() {
    const selected = selection();
    return selected.length > 0 && selected.every(c => Number.isInteger(percentage(c)) && percentage(c) > 0 && percentage(c) <= 100)
      && selected.reduce((sum,c) => sum + percentage(c), 0) === 100;
  }
  function updateMix() {
    const amount = selection().reduce((sum,c) => sum + (Number.isFinite(percentage(c)) ? percentage(c) : 0), 0);
    $("mixTotal").textContent = `${amount}%`;
    $("mixProgress").value = amount;
    $("mixProgress").textContent = `${amount}%`;
    $("addSession").disabled = !sessionProduct?.disponivel || !mixValid();
    $("mixStatus").textContent = !sessionProduct?.disponivel ? "Esta sessão está indisponível no momento."
      : !choices.length ? "Ainda não há essências disponíveis para esta sessão."
      : mixValid() ? "Mistura completa! Pode adicionar ao pedido."
      : amount === 100 ? "Dê uma porcentagem a cada sabor marcado ou desmarque os que não vai usar."
      : `Faltam ${100-amount}% para completar sua sessão.`;
  }
  function openSession(product, button) {
    if (!product.disponivel) { feedback(`${product.nome} está indisponível no momento.`); return; }
    sessionProduct = product; trigger = button; choices = [];
    $("sessionTitle").textContent = product.nome;
    $("addSession").textContent = `Adicionar sessão · ${money(product.preco)}`;
    $("essenceChoices").replaceChildren();
    for (const essence of essences.filter(e => e.sessoes.includes(product.id))) {
      const row = element("div", undefined, "essence-choice");
      const label = element("label", undefined, "essence-label");
      const check = element("input"); check.type = "checkbox";
      const photo = element("img"); photo.src = essence.imagem || "/assets/logo.png";
      photo.alt = essence.imagem ? `${essence.marca} ${essence.sabor}` : "";
      photo.loading = "lazy";
      const caption = element("span"); caption.append(element("small", essence.marca), element("strong", essence.sabor));
      label.append(check, photo, caption);
      const pctLabel = element("label", undefined, "essence-percent");
      const input = element("input"); input.type = "number"; input.min = "0"; input.max = "100"; input.step = "1";
      input.inputMode = "numeric"; input.value = "0"; input.disabled = true;
      input.setAttribute("aria-label", `Porcentagem de ${essence.marca} ${essence.sabor}`);
      pctLabel.append(input, element("span", "%"));
      row.append(label, pctLabel); $("essenceChoices").append(row);
      const choice = {essence, check, input}; choices.push(choice);
      check.addEventListener("change", () => {
        input.disabled = !check.checked;
        if (!check.checked) input.value = "0";
        else input.focus();
        updateMix();
      });
      input.addEventListener("input", () => {
        const used = selection().filter(c => c !== choice).reduce((sum,c) => sum + percentage(c), 0);
        const value = Math.floor(Number(input.value));
        input.value = String(Math.max(0, Math.min(100-used, Number.isFinite(value) ? value : 0)));
        updateMix();
      });
    }
    updateMix();
    dialog.showModal();
    document.body.classList.add("mix-open");
  }
  $("closeSession").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { document.body.classList.remove("mix-open"); trigger?.focus(); });
  $("addSession").addEventListener("click", () => {
    if (!sessionProduct?.disponivel || !mixValid()) { updateMix(); return; }
    const flavors = selection().map(c => ({...c.essence, percentage:percentage(c)}));
    if (addProduct(sessionProduct, flavors)) dialog.close();
  });
  $("demo").hidden = !config.demonstracao;
  const searchableCards = [], categoryLinks = [];
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const categoryCopy = {
    "Sessões": "Escolha sua sessão e combine os sabores do seu jeito.",
    "Bebidas": "Para acompanhar a conversa.",
    "Drinks": "Um brinde aos bons momentos.",
    "Esquine": "Mais opções para o seu encontro.",
    "Doces": "Um toque doce para completar."
  };
  function illustration(category, name = "") {
    const kind = category === "Sessões" ? "session" : category === "Drinks" ? "drinks"
      : category === "Doces" ? "sweet" : normalize(name).includes("agua") ? "bottle" : "glass";
    const art = element("img"); art.src = `/assets/menu-${kind}.svg`; art.alt = ""; art.loading = "lazy";
    return art;
  }
  function activateCategory(active) {
    for (const {link} of categoryLinks) link.setAttribute("aria-current", link === active ? "true" : "false");
  }
  // Native dialog keeps keyboard focus inside the product details.
  const detail = element("dialog", undefined, "session-dialog product-dialog");
  detail.setAttribute("aria-labelledby", "detailTitle");
  let detailTrigger;
  function openDetail(p, button) {
    detailTrigger = button;
    detail.replaceChildren();
    const close = element("button", "✕", "quiet detail-close");
    close.type = "button"; close.setAttribute("aria-label", "Fechar detalhes");
    close.addEventListener("click", () => detail.close());
    const title = element("h2", p.nome); title.id = "detailTitle";
    detail.append(close);
    if (p.imagem) {
      const img = element("img"); img.src = p.imagem; img.alt = p.nome; img.className = "detail-photo"; detail.append(img);
    }
    detail.append(element("p", "ESCOLHIDO POR VOCÊ", "eyebrow"), title, element("p", p.descricao || "Uma escolha para aproveitar na TabaGyn.", "muted"));
    const add = element("button", p.disponivel ? `Adicionar ao pedido · ${money(p.preco)}` : "Indisponível", "detail-add");
    add.type = "button"; add.disabled = !p.disponivel;
    add.addEventListener("click", () => { if (addProduct(p)) detail.close(); });
    detail.append(add); detail.showModal(); document.body.classList.add("mix-open");
  }
  detail.addEventListener("close", () => { document.body.classList.remove("mix-open"); detailTrigger?.focus(); });
  document.body.append(detail);
  for (const category of config.categorias) {
    const section = element("section", undefined, "category");
    section.id = `cat-${category.id}`;
    const link = element("a"); link.href = `#${section.id}`;
    const index = element("span", String(categoryLinks.length + 1).padStart(2, "0"), "nav-index"); index.setAttribute("aria-hidden", "true");
    link.append(index, element("span", category.nome));
    $("categories").append(link);
    categoryLinks.push({link, section});
    link.addEventListener("click", () => activateCategory(link));
    const categoryProducts = products.filter(p => p.categoria === category.id);
    const heading = element("h2", category.nome);
    if (categoryProducts.length) heading.append(element("span", String(categoryProducts.length).padStart(2, "0"), "category-count"));
    section.append(heading, element("p", category.descricao || categoryCopy[category.nome] || "", "muted"));
    const grid = element("div", undefined, "products");
    if (categoryProducts.length === 1) grid.classList.add("products-single");
    for (const p of categoryProducts) {
      const card = element("article", undefined, "product");
      if (p.imagem) {
        const photo = element("img"); photo.src = p.imagem; photo.alt = p.nome; photo.loading = "lazy"; photo.className = "product-photo"; card.append(photo);
      } else {
        const cover = element("div", undefined, "product-cover"); cover.setAttribute("aria-hidden", "true");
        cover.append(illustration(category.nome, p.nome), element("small", "TABAGYN · BONS MOMENTOS")); card.append(cover);
      }
      const title = element("h3");
      const detailButton = element("button", p.nome, "product-title");
      detailButton.type = "button";
      detailButton.setAttribute("aria-label", `Ver detalhes de ${p.nome}`);
      detailButton.addEventListener("click", () => isSession(p) ? openSession(p, detailButton) : openDetail(p, detailButton));
      title.append(detailButton);
      card.append(element("span", category.nome, "eyebrow"), title, element("p", p.descricao));
      searchableCards.push({card, section, text:normalize(`${p.nome} ${p.descricao || ""} ${category.nome}`)});
      const bottom = element("div", undefined, "product-bottom");
      const add = element("button", p.disponivel ? (isSession(p) ? "Montar sessão ↗" : "+ Adicionar") : "Indisponível");
      add.type = "button"; add.disabled = !p.disponivel;
      add.setAttribute("aria-label", `${p.disponivel ? (isSession(p) ? "Montar" : "Adicionar") : "Indisponível:"} ${p.nome}`);
      add.addEventListener("click", () => { if (isSession(p)) openSession(p, add); else addProduct(p); });
      bottom.append(element("strong", money(p.preco)), add); card.append(bottom); grid.append(card);
    }
    if (!grid.childElementCount) {
      const empty = element("div", undefined, "category-empty");
      const copy = element("div");
      copy.append(element("strong", "Ainda não há opções nesta categoria."), element("p", "Explore as outras escolhas do cardápio."));
      empty.append(illustration(category.nome), copy); grid.append(empty);
    }
    section.append(grid); $("menu").append(section);
  }
  if (categoryLinks.length) activateCategory(categoryLinks[0].link);
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) activateCategory(categoryLinks.find(item => item.section === visible[0].target).link);
    }, {rootMargin:"-155px 0px -55% 0px", threshold:0});
    categoryLinks.forEach(({section}) => observer.observe(section));
  }
  $("search")?.addEventListener("input", () => {
    const query = normalize($("search").value.trim());
    let count = 0;
    for (const item of searchableCards) { item.card.hidden = !item.text.includes(query); if (!item.card.hidden) count++; }
    for (const {section, link} of categoryLinks) {
      section.hidden = !!query && !searchableCards.some(item => item.section === section && !item.card.hidden);
      link.hidden = section.hidden;
    }
    const first = categoryLinks.find(item => !item.section.hidden);
    if (first) activateCategory(first.link);
    $("searchStatus").hidden = !query;
    $("searchStatus").textContent = count ? `${count} produto${count === 1 ? " encontrado" : "s encontrados"}.` : "Nenhum produto encontrado. Tente outro nome ou categoria.";
  });
  $("clear").addEventListener("click", () => { cart.clear(); renderCart(); feedback("Pedido limpo."); });
  $("checkout").addEventListener("submit", event => {
    event.preventDefault();
    if (!cart.size) { $("status").textContent = "Adicione pelo menos um produto ao pedido."; return; }
    if (!$("table").value.trim()) {
      $("status").textContent = "Informe sua mesa para finalizar o pedido.";
      $("table").focus();
      return;
    }
    const phone = String(config.whatsapp || "").replace(/\D/g, "");
    if (!/^[1-9]\d{9,14}$/.test(phone)) { $("status").textContent = "O WhatsApp da loja ainda não foi configurado."; return; }
    const lines = ["Olá! Gostaria de fazer um pedido na TABAGYN:", "Consumo no local — sem entrega", ""];
    if (config.demonstracao) lines.unshift("TESTE — CARDÁPIO DE DEMONSTRAÇÃO", "");
    for (const { product: p, quantity, flavors } of entries()) {
      lines.push(`${quantity}x ${p.nome} — ${money(p.preco * quantity)}`);
      for (const flavor of flavors) lines.push(`  ${flavorText(flavor)}`);
    }
    lines.push("", `Total: ${money(total())}`);
    for (const [id, label] of [["name", "Nome"], ["table", "Mesa"], ["notes", "Observações"]]) {
      const value = $(id).value.trim(); if (value) lines.push(`${label}: ${value}`);
    }
    lines.push("", "Aguardo a confirmação de disponibilidade e valores.");
    $("status").textContent = "Revise a mensagem e toque em enviar no WhatsApp.";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  });
  renderCart();
})();
