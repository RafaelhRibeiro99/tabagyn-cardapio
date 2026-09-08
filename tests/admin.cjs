const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
class Element {
  constructor(){this.children=[];this.events={};this.value='';this.checked=false;this.hidden=false;this.files=[];this.dataset={};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(){this.children=[];}
  setAttribute(k,v){this[k]=v;}
  addEventListener(k,fn){this.events[k]=fn;}
  reset(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  querySelectorAll(){return this.children.flatMap(n=>n.children).filter(n=>n.checked);}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(allowed=true){
  const ids={};for(const match of fs.readFileSync('docs/admin.html','utf8').matchAll(/id="([^"]+)"/g))ids[match[1]]=new Element();
  const tabs=['produtos','essencias','settings','users'].map(tab=>{const el=new Element();el.dataset.tab=tab;return el;});
  let payload={whatsapp:'5562992114211',demonstracao:false,categorias:[{id:'s',nome:'Sessões'},{id:'b',nome:'Bebidas'}],produtos:[{id:'p',nome:'Sessão',categoria:'s',preco:2500,sessao:true,disponivel:true,descricao:''}],essencias:[{id:'e',marca:'Marca',sabor:'Sabor',sessoes:['p'],disponivel:true}]};
  let revision=1,conflict=false,updates=0,signedOut=0;
  const client={auth:{getSession:async()=>({data:{session:null}}),signInWithPassword:async()=>({error:null}),signOut:async()=>{signedOut++;return{};}},rpc:async()=>({data:allowed}),from:()=>({
    select:()=>({eq:()=>({single:async()=>({data:{payload:structuredClone(payload),revision}})})}),
    update:value=>{const filters=[];const chain={eq:(k,v)=>{filters.push([k,v]);return chain;},select:()=>chain,maybeSingle:async()=>{assert.deepEqual(filters,[['id',1],['revision',revision]]);if(conflict)return{data:null};updates++;payload=structuredClone(value.payload);revision=value.revision;return{data:{revision}};}};return chain;}
  })};
  const context={window:{STORE_CONFIG:{url:'https://example.supabase.co',publishableKey:'public'},supabase:{createClient:()=>client}},document:{getElementById:id=>ids[id],querySelectorAll:s=>s==='[data-tab]'?tabs:[...Object.values(ids),...tabs],createElement:()=>new Element()},sessionStorage:{},structuredClone,crypto:{randomUUID},confirm:()=>true};
  client.functions={invoke:async(name,{body})=>{assert.equal(name,'create-store-user');assert.equal(body.email,'new@example.test');return{data:{user:{id:'new',email:body.email}}};}};
  vm.runInNewContext(fs.readFileSync('docs/admin.js','utf8'),context);await flush();
  return{ids,tabs,login:async()=>{ids.email.value='admin@example.test';ids.password.value='test-only';await ids.loginForm.events.submit({preventDefault(){}});},data:()=>payload,updates:()=>updates,signedOut:()=>signedOut,setConflict:()=>{conflict=true;}};
}
(async()=>{
  const s=await setup();await s.login();assert.equal(s.ids.workspace.hidden,false);assert.equal(s.ids.password.value,'');
  s.tabs[3].onclick();assert.equal(s.ids.userForm.hidden,false);assert.equal(s.ids.list.hidden,true);assert.equal(s.ids.newItem.hidden,true);
  s.ids.newEmail.value='new@example.test';s.ids.newPassword.value='password123';s.ids.confirmPassword.value='different';
  await s.ids.userForm.events.submit({preventDefault(){}});assert.match(s.ids.userStatus.textContent,/não coincidem/);
  s.ids.confirmPassword.value='password123';await s.ids.userForm.events.submit({preventDefault(){}});
  assert.match(s.ids.userStatus.textContent,/acesso completo/);assert.equal(s.ids.newPassword.value,'');assert.equal(s.signedOut(),0);
  s.tabs[0].onclick();assert.equal(s.ids.userForm.hidden,true);
  s.ids.list.children[0].children[1].children[0].onclick();
  s.ids.productName.value='Sessão nova';s.ids.price.value='30,50';
  await s.ids.itemForm.events.submit({preventDefault(){}});
  assert.equal(s.data().produtos[0].preco,3050);assert.equal(s.ids.editor.open,false);assert.equal(s.updates(),1);
  s.tabs[1].onclick();s.ids.list.children[0].children[1].children[0].onclick();
  s.ids.flavor.value='Novo sabor';await s.ids.itemForm.events.submit({preventDefault(){}});
  assert.equal(s.data().essencias[0].sabor,'Novo sabor');assert.equal(s.data().essencias[0].sessoes[0],'p');
  s.tabs[0].onclick();s.ids.list.children[0].children[1].children[0].onclick();
  s.ids.price.value='inválido';await s.ids.itemForm.events.submit({preventDefault(){}});assert.equal(s.updates(),2);
  s.ids.price.value='31,00';s.setConflict();await s.ids.itemForm.events.submit({preventDefault(){}});
  assert.match(s.ids.editorStatus.textContent,/mudou em outro acesso/);assert.equal(s.ids.editor.open,true);assert.equal(s.data().produtos[0].preco,3050);
  const denied=await setup(false);await denied.login();assert.match(denied.ids.status.textContent,/não tem acesso/);assert.equal(denied.signedOut(),1);assert.equal(denied.updates(),0);
  console.log('PASS: admin authorization, product price save, essence links, invalid price and concurrent update conflict (mock service).');
})().catch(error=>{console.error(error);process.exitCode=1;});
