(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const config = window.STORE_CONFIG;
  if (!config?.url || !window.supabase) {
    $("status").textContent = "O acesso da loja ainda está em configuração. Tente novamente mais tarde.";
    $("loginPanel").hidden = true;
    return;
  }
  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { storage: sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  let catalog, revision, tab = "produtos", editingId = null, busy = false;
  const money = n => (n / 100).toLocaleString("pt-BR", {style:"currency",currency:"BRL"});
  function node(tag, text) { const el = document.createElement(tag); if (text != null) el.textContent = text; return el; }
  function message(text) { $("status").textContent = text; }
  function failure(error) {
    if (error?.message === "conflict") return "O catálogo mudou em outro acesso. Atualize a lista e refaça esta alteração.";
    if (error?.message === "unauthorized") return "Sua conta não tem acesso de administrador. Confira a autorização no Supabase.";
    return "Não foi possível concluir. Verifique sua conexão, o login e a configuração do Supabase. Nenhuma confirmação de salvamento foi recebida.";
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll("button").forEach(b => b.disabled = value);
  }
  async function readCatalog() {
    const {data,error} = await client.from("store_catalog").select("payload,revision").eq("id",1).single();
    if (error) throw error;
    catalog = data.payload; revision = data.revision;
    render();
  }
  async function saveCatalog(next) {
    const {data,error} = await client.from("store_catalog").update({payload:next,revision:revision+1})
      .eq("id",1).eq("revision",revision).select("revision").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("conflict");
    catalog = next; revision = data.revision; render();
  }
  async function enter() {
    const {data,error} = await client.rpc("is_store_admin");
    if (error) throw error;
    if (!data) throw new Error("unauthorized");
    await readCatalog();
    $("loginPanel").hidden = true; $("workspace").hidden = false; $("logout").hidden = false;
    $("password").value = ""; message("");
  }
  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return; setBusy(true); message("Entrando…");
    try {
      const {error} = await client.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
      if (error) { message("Não foi possível entrar. Confira seu e-mail e senha."); return; }
      await enter();
    } catch (error) { message(failure(error)); await client.auth.signOut({scope:"local"}); }
    finally { setBusy(false); }
  });
  $("logout").addEventListener("click", async () => {
    await client.auth.signOut({scope:"local"});
    catalog = null; $("workspace").hidden = true; $("logout").hidden = true; $("loginPanel").hidden = false; message("Você saiu da conta.");
  });
  function render() {
    document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-current",String(b.dataset.tab === tab)));
    $("settingsForm").hidden = tab !== "settings"; $("list").hidden = tab === "settings";
    $("newItem").hidden = tab === "settings";
    $("newItem").textContent = tab === "essencias" ? "Nova essência" : "Novo produto";
    $("phone").value = catalog.whatsapp; $("demoMode").checked = catalog.demonstracao;
    $("list").replaceChildren();
    if (tab === "settings") return;
    for (const item of catalog[tab]) {
      const row = node("div"); row.className = "row";
      const info = node("div"); info.append(node("strong",tab === "produtos" ? item.nome : `${item.marca} · ${item.sabor}`));
      info.append(node("small",`${tab === "produtos" ? money(item.preco) + " · " : ""}${item.disponivel !== false ? "Disponível" : "Indisponível"}`));
      const actions = node("div"); actions.className = "actions";
      const edit = node("button","Editar"); edit.onclick = () => editItem(item); actions.append(edit);
      const remove = node("button","Excluir"); remove.className = "secondary";
      remove.onclick = async () => {
        if (busy || !confirm("Excluir este cadastro do cardápio?")) return;
        setBusy(true);
        try {
          const next = structuredClone(catalog); next[tab] = next[tab].filter(p => p.id !== item.id);
          if (tab === "produtos") next.essencias.forEach(e => e.sessoes = e.sessoes.filter(id => id !== item.id));
          await saveCatalog(next); message("Cadastro excluído.");
        } catch (error) { message(failure(error)); } finally { setBusy(false); }
      };
      actions.append(remove); row.append(info,actions); $("list").append(row);
    }
    if (!catalog[tab].length) $("list").append(node("p","Nenhum cadastro nesta lista."));
  }
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  $("reload").onclick = async () => {
    setBusy(true);
    try { await readCatalog(); message("Lista atualizada."); } catch (error) { message(failure(error)); } finally { setBusy(false); }
  };
  $("newItem").onclick = () => editItem();
  $("cancelEdit").onclick = () => $("editor").close();
  $("editor").addEventListener("cancel", e => { if (busy) e.preventDefault(); });
  function editItem(item) {
    editingId = item?.id || null; $("itemForm").reset(); $("editorStatus").textContent = "";
    const product = tab === "produtos";
    $("productFields").hidden = !product; $("essenceFields").hidden = product;
    $("editorTitle").textContent = `${item ? "Editar" : "Cadastrar"} ${product ? "produto" : "essência"}`;
    $("productName").value = item?.nome || ""; $("description").value = item?.descricao || "";
    $("price").value = product && item ? (item.preco / 100).toFixed(2).replace(".",",") : "";
    $("category").replaceChildren();
    catalog.categorias.forEach(c => { const option = node("option",c.nome); option.value = c.id; $("category").append(option); });
    if (product && item) $("category").value = item.categoria;
    $("session").checked = !!item?.sessao;
    $("brand").value = item?.marca || ""; $("flavor").value = item?.sabor || "";
    $("available").checked = item?.disponivel !== false;
    $("preview").hidden = !item?.imagem; $("preview").src = item?.imagem || "./logo.png";
    $("sessions").replaceChildren();
    for (const p of catalog.produtos.filter(p => p.sessao || catalog.categorias.find(c => c.id === p.categoria)?.nome === "Sessões")) {
      const label = node("label"); label.className = "check";
      const input = node("input"); input.type = "checkbox"; input.value = p.id; input.checked = !!item?.sessoes?.includes(p.id);
      label.append(input,node("span",p.nome)); $("sessions").append(label);
    }
    $("editor").showModal();
  }
  async function uploadPhoto(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5242880) throw new Error("photo");
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 20000000) { bitmap.close(); throw new Error("photo"); }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1,1200 / Math.max(bitmap.width,bitmap.height));
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",.85));
    if (!blob) throw new Error("photo");
    const name = `${crypto.randomUUID()}.jpg`;
    const {error} = await client.storage.from("catalog-images").upload(name,blob,{contentType:"image/jpeg",upsert:false});
    if (error) throw error;
    return {name,url:client.storage.from("catalog-images").getPublicUrl(name).data.publicUrl};
  }
  $("itemForm").addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return;
    const product = tab === "produtos";
    const item = structuredClone(catalog[tab].find(p => p.id === editingId) || {id:crypto.randomUUID(),imagem:null});
    if (product) {
      const price = $("price").value.trim().replace(",",".");
      if (!$("productName").value.trim() || !/^\d{1,6}(\.\d{1,2})?$/.test(price)) { $("editorStatus").textContent = "Informe nome e preço válido, como 25,00."; return; }
      Object.assign(item,{nome:$("productName").value.trim(),categoria:$("category").value,descricao:$("description").value.trim(),preco:Math.round(Number(price)*100),sessao:$("session").checked || catalog.categorias.find(c => c.id === $("category").value)?.nome === "Sessões"});
    } else {
      if (!$("brand").value.trim() || !$("flavor").value.trim()) { $("editorStatus").textContent = "Informe marca e sabor."; return; }
      Object.assign(item,{marca:$("brand").value.trim(),sabor:$("flavor").value.trim(),sessoes:[...$("sessions").querySelectorAll("input:checked")].map(input => input.value)});
    }
    item.disponivel = $("available").checked;
    if ($("removePhoto").checked) item.imagem = null;
    setBusy(true); $("editorStatus").textContent = "Salvando…";
    try {
      const file = $("photo").files[0];
      if (file) item.imagem = (await uploadPhoto(file)).url;
      const next = structuredClone(catalog);
      const index = next[tab].findIndex(p => p.id === item.id);
      if (index < 0) next[tab].push(item); else next[tab][index] = item;
      if (product && !item.sessao) next.essencias.forEach(e => e.sessoes = e.sessoes.filter(id => id !== item.id));
      await saveCatalog(next); $("editor").close(); message("Cadastro salvo.");
    } catch (error) { $("editorStatus").textContent = error.message === "photo" ? "Use uma imagem JPG, PNG ou WebP de até 5 MB e 20 megapixels." : failure(error); }
    finally { setBusy(false); }
  });
  $("settingsForm").addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return; setBusy(true);
    try { const next = structuredClone(catalog); next.whatsapp = $("phone").value.trim(); next.demonstracao = $("demoMode").checked; await saveCatalog(next); message("Configurações salvas."); }
    catch (error) { message(failure(error)); } finally { setBusy(false); }
  });
  (async () => {
    setBusy(true);
    try { const {data,error} = await client.auth.getSession(); if (error) throw error; if (data.session) await enter(); }
    catch (error) { message(failure(error)); await client.auth.signOut({scope:"local"}); }
    finally { setBusy(false); }
  })();
})();
