// Code exécuté dans un iframe à origine opaque, sans accès au stockage ou aux requêtes réseau.
(() => {
 const scripts=['app.js?v=17','settings.js?v=5','profile.js?v=14','dashboard.js?v=3','first-exchange.js?v=6','vendor/jszip.min.js','reports.js?v=9','companies.js?v=6','backup-bundle.js?v=4','coldcalls.js?v=13','projects.js?v=4','coldcall-reopen.js?v=2'];
 let started=false;
 function start(data){
  const items=new Map([['pulse-crm-v2',JSON.stringify(data)]]);
  const memory={getItem:k=>items.has(String(k))?items.get(String(k)):null,setItem:(k,v)=>items.set(String(k),String(v)),removeItem:k=>items.delete(String(k)),clear:()=>items.clear(),key:i=>[...items.keys()][i]??null,get length(){return items.size}};
  Object.defineProperty(window,'localStorage',{value:memory,configurable:false,writable:false});
  document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation()},true);
  document.addEventListener('change',e=>{if(!e.target.matches('#search,#role-filter,#sector-filter')){e.preventDefault();e.stopImmediatePropagation()}},true);
  document.addEventListener('click',e=>{const button=e.target.closest?.('button');if(button&&!button.matches('.nav,.contact-link,.followup-title,#close,.company-close')){e.preventDefault();e.stopImmediatePropagation()}},true);
  const load=src=>new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>reject(Error('Ressource indisponible'));document.body.append(tag)});
  (async()=>{for(const src of scripts)await load(src);parent.postMessage({type:'crm-preview-loaded'},'*')})().catch(()=>parent.postMessage({type:'crm-preview-error'},'*'));
 }
 addEventListener('message',event=>{if(started||event.source!==parent||event.origin!==new URL(document.baseURI).origin||event.data?.type!=='crm-preview-snapshot')return;started=true;start(event.data.data)});
 parent.postMessage({type:'crm-preview-ready'},'*');
})();
