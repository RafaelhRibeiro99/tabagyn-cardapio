const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('docs/catalog-loader.js','utf8');
function context(enabled, response) {
  let calls = 0;
  const window = {STORE_CONFIG:{enabled,url:'https://example.supabase.co',publishableKey:'public-key'},CARDAPIO:{local:true}};
  const ctx = {window,AbortSignal,fetch:async (url,options) => {
    calls++;
    assert.equal(options.headers.apikey,'public-key');
    assert.equal(options.cache,'no-store');
    assert.match(url,/store_catalog/);
    return response;
  }};
  vm.runInNewContext(source,ctx);
  return {window,calls:()=>calls};
}
(async () => {
  const disabled = context(false); await disabled.window.loadStoreCatalog(); assert.equal(disabled.calls(),0);
  const payload = {produtos:[],categorias:[],essencias:[],whatsapp:'5562992114211'};
  const ready = context(true,{ok:true,json:async()=>[{payload}]}); await ready.window.loadStoreCatalog(); assert.deepEqual(ready.window.CARDAPIO,payload);
  for (const response of [{ok:false},{ok:true,json:async()=>[]},{ok:true,json:async()=>[{payload:{}}]}]) {
    const bad = context(true,response); await assert.rejects(bad.window.loadStoreCatalog());
    assert.equal(bad.window.CARDAPIO.local,true);
  }
  console.log('PASS: static mode, cloud catalog loading, missing setup and network failure.');
})().catch(error => {console.error(error);process.exitCode=1;});
