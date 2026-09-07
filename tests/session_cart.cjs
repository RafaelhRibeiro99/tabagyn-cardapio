// Exercise real UI event handlers without a browser or external dependencies.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
class Element {
  constructor() { this.children=[]; this.dataset={}; this.events={}; this.value=''; this.checked=false; this.classList={add(){},remove(){}}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren() { this.children=[]; }
  setAttribute(key,value) { this[key]=value; }
  addEventListener(key,callback) { this.events[key]=callback; }
  get childElementCount() { return this.children.length; }
  focus() {}
  showModal() { this.open=true; }
  close() { this.open=false; this.events.close?.(); }
}
const ids = Object.fromEntries(['count','total','items','clear','name','table','notes','demo','categories','menu','checkout','status','feedback','mobileCart','mobileCount','mobileTotal','sessionDialog','sessionTitle','addSession','closeSession','essenceChoices','mixTotal','mixProgress','mixStatus'].map(id=>[id,new Element()]));
const config={whatsapp:'5562992114211', categorias:[{id:'s',nome:'Sessões'},{id:'b',nome:'Bebidas'}], produtos:[
  {id:'premium',categoria:'s',nome:'Premium',preco:2500,disponivel:true,sessao:true},
  {id:'empty',categoria:'s',nome:'Empty',preco:2000,disponivel:true,sessao:true},
  {id:'water',categoria:'b',nome:'Water',preco:600,disponivel:true}],essencias:[
  {id:'a',marca:'Brand A',sabor:'Flavor A',imagem:'/a.jpg',sessoes:['premium']},
  {id:'b',marca:'Brand B',sabor:'Flavor B',imagem:'/b.jpg',sessoes:['premium']},
  {id:'c',marca:'Brand C',sabor:'Hidden flavor',sessoes:['other']} ]};
let opened;
ids.search = new Element(); ids.searchStatus = new Element();
for (const id of ['openCart','closeCart','cartDialog','finishOrder']) ids[id] = new Element();
const context={window:{CARDAPIO:config,open:url=>opened=url}, document:{getElementById:id=>ids[id],createElement:()=>new Element(),body:new Element(),activeElement:null},setTimeout:()=>0,clearTimeout(){}};
vm.createContext(context); vm.runInContext(fs.readFileSync('docs/app.js','utf8'),context);
const cards=ids.menu.children.flatMap(section=>section.children.at(-1).children);
const add=index=>cards[index].children.at(-1).children.at(-1).events.click();
const choice=index=>({check:ids.essenceChoices.children[index].children[0].children[0],input:ids.essenceChoices.children[index].children[1].children[0]});
const set=(index,amount)=>{const {check,input}=choice(index);if(!check.checked){check.checked=true;check.events.change();}input.value=String(amount);input.events.input();};
add(0);assert.equal(ids.sessionDialog.open,true);assert.equal(ids.essenceChoices.children.length,2);assert.equal(ids.addSession.disabled,true);assert.equal(ids.count.textContent,0);
set(0,60);set(1,60);assert.equal(choice(1).input.value,'40');assert.equal(ids.mixTotal.textContent,'100%');assert.equal(ids.addSession.disabled,false);
set(0,-5);assert.equal(choice(0).input.value,'0');assert.equal(ids.addSession.disabled,true);
set(0,60);ids.addSession.events.click();assert.equal(ids.sessionDialog.open,false);assert.equal(ids.count.textContent,1);assert.match(ids.total.textContent,/25,00/);
add(0);set(0,100);ids.addSession.events.click();assert.equal(ids.items.children.length,2,'Different blends stay separate');
add(0);set(0,60);set(1,40);ids.addSession.events.click();assert.equal(ids.items.children.length,2,'Same blend increments quantity');assert.equal(ids.count.textContent,3);
add(0);set(0,100);const zero=choice(1);zero.check.checked=true;zero.check.events.change();assert.equal(ids.addSession.disabled,true,'Selected zero percentage is invalid');ids.addSession.events.click();assert.equal(ids.count.textContent,3);ids.closeSession.events.click();
add(1);assert.equal(ids.essenceChoices.children.length,0);assert.equal(ids.addSession.disabled,true);ids.addSession.events.click();assert.equal(ids.count.textContent,3);ids.closeSession.events.click();
add(2);assert.equal(ids.count.textContent,4);assert.match(ids.total.textContent,/81,00/);
for (const missingTable of ['', '   ']) {
  ids.table.value=missingTable;
  ids.checkout.events.submit({preventDefault(){}});
  assert.equal(opened,undefined,'Missing or blank table must not open WhatsApp');
  assert.match(ids.status.textContent,/Informe sua mesa/);
}
ids.table.value='08';
ids.checkout.events.submit({preventDefault(){}});const message=new URL(opened).searchParams.get('text');assert.match(message,/Brand A · Flavor A: 60%/);assert.match(message,/Brand B · Flavor B: 40%/);assert.match(message,/100%/);assert.match(message,/81,00/);assert.doesNotMatch(message,/Hidden flavor/);
assert.match(message,/Mesa: 08/);
console.log('PASS: table required, whitespace rejected and valid table included in WhatsApp.');
ids.clear.events.click();assert.equal(ids.count.textContent,0);assert.equal(ids.mobileCart.hidden,false);
// Search must hide unmatched categories and recover when cleared.
ids.search.value='wáter'; ids.search.events.input();
assert.equal(cards[2].hidden,false); assert.equal(cards[0].hidden,true);
assert.equal(ids.menu.children[0].hidden,true); assert.equal(ids.menu.children[1].hidden,false);
ids.search.value='nothing matches'; ids.search.events.input();
assert.equal(cards.every(card=>card.hidden),true); assert.match(ids.searchStatus.textContent,/Nenhum produto/);
ids.search.value=''; ids.search.events.input();
assert.equal(cards.every(card=>!card.hidden),true); assert.equal(ids.searchStatus.hidden,true);
// Product details expose an add action without changing direct-add behavior.
cards[2].children[2].children[0].events.click();
const detail=context.document.body.children[0]; assert.equal(detail.open,true);
detail.children.at(-1).events.click(); assert.equal(detail.open,false); assert.equal(ids.count.textContent,1);
ids.clear.events.click();
console.log('PASS: allowed flavors, exact 100%, overflow clamp, invalid percentages, empty session, blend quantities, ordinary products and WhatsApp message.');
console.log('PASS: accent-insensitive search, empty results, category recovery, product details and add from details.');

ids.mobileCart.events.click(); assert.equal(ids.cartDialog.open,true); assert.equal(ids.finishOrder.disabled,true);
ids.closeCart.events.click(); assert.equal(ids.cartDialog.open,false);
add(2); ids.openCart.events.click(); assert.equal(ids.cartDialog.open,true); assert.equal(ids.finishOrder.disabled,false);
ids.table.value='08'; ids.notes.value='Sem gelo';
ids.checkout.events.submit({preventDefault(){}});
const checkoutUrl=new URL(opened); assert.equal(checkoutUrl.pathname,'/5562992114211');
assert.match(checkoutUrl.searchParams.get('text'),/Mesa: 08/); assert.match(checkoutUrl.searchParams.get('text'),/Sem gelo/);
assert.match(checkoutUrl.searchParams.get('text'),/sem entrega/);
console.log('PASS: cart opens and closes, empty checkout disabled, destination phone, table and notes.');

// Unavailable products cannot enter the cart through title or stale add actions.
ids.closeCart.events.click(); ids.clear.events.click();
config.produtos[0].disponivel = false;
cards[0].children[2].children[0].events.click();
assert.equal(ids.sessionDialog.open,false,'Unavailable session title must not open its mixer');
assert.equal(ids.count.textContent,0);
assert.match(ids.feedback.textContent,/indisponível/);
config.produtos[2].disponivel = false;
add(2);
assert.equal(ids.count.textContent,0,'Unavailable ordinary product must not be added');
config.produtos[0].disponivel = true;
add(0); set(0,100);
config.produtos[0].disponivel = false;
ids.addSession.events.click();
assert.equal(ids.count.textContent,0,'Session must still be available when its mix is submitted');
assert.equal(ids.addSession.disabled,true);
assert.match(ids.mixStatus.textContent,/indisponível/);
ids.closeSession.events.click();
console.log('PASS: unavailable session title, ordinary product and session submission stay blocked.');
