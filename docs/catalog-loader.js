window.loadStoreCatalog = async function () {
  const config = window.STORE_CONFIG;
  if (!config?.enabled) return;
  const response = await fetch(`${config.url}/rest/v1/store_catalog?id=eq.1&select=payload`, {
    headers: { apikey: config.publishableKey },
    signal: AbortSignal.timeout(12000), cache: "no-store"
  });
  if (!response.ok) throw new Error("Catálogo indisponível");
  const rows = await response.json();
  const catalog = rows[0]?.payload;
  if (!catalog || !Array.isArray(catalog.produtos) || !Array.isArray(catalog.categorias)) throw new Error("Catálogo não configurado");
  window.CARDAPIO = catalog;
};
