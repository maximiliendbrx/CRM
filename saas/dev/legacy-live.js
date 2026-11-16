// Prototype expérimental en iframe opaque : aucune clé ou session dans ce cadre.
(() => {
 const scripts=['app.js?v=17','saas/dev/live-settings.js','profile.js?v=14','dashboard.js?v=3','first-exchange.js?v=6','vendor/jszip.min.js','reports.js?v=9','companies.js?v=6','coldcalls.js?v=13','projects.js?v=4','coldcall-reopen.js?v=2'];
 let started=false,port=null,inFlight=false,queued=null,lastSent=null,blocked=false,sequence=0,ready=false,backupSequence=0;const backupRequests=new Map();
 const overlay=document.createElement('div');overlay.id='crm-save-overlay';overlay.setAttribute('role','status');overlay.hidden=true;
 Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'2147483647',display:'none',background:'rgba(15,35,55,.85)',color:'white',padding:'10vh 8%',font:'16px system-ui'});
 const label=document.createElement('p'),download=document.createElement('button'),reload=document.createElement('button');
 download.type=reload.type='button';download.textContent='Télécharger mes modifications';reload.textContent='Abandonner ces modifications et recharger';overlay.append(label,download,reload);
 function show(message,failed=false){label.textContent=message;download.hidden=reload.hidden=!failed;overlay.hidden=false;overlay.style.display='block'}
 function hide(){overlay.hidden=true;overlay.style.display='none'}
 function replaceData(data){db=structuredClone(data);localStorage.setItem('pulse-crm-v2',JSON.stringify(db));settings={showStats:true,autoBackup:true,backupTime:'18:00',...(db.__saas_settings||{})};goals={calls:150,interactions:200,followups:50,...(db.__saas_goals||{})};applySettings();for(const key of ['calls','interactions','followups'])document.getElementById('goal-'+key).value=goals[key];if(!db.contacts.some(contact=>contact.id===selected))selected=null;render()}
 function sendNext(){if(inFlight||!queued||blocked)return;lastSent=queued;queued=null;inFlight=true;show('Enregistrement en cours…');port.postMessage({type:'save',data:lastSent.data,sequence:lastSent.sequence})}
 function save(){if(blocked)return;queued={data:structuredClone(db),sequence:++sequence};port.postMessage({type:'dirty',data:queued.data,sequence:queued.sequence});show('Enregistrement en cours…');sendNext()}
 download.onclick=()=>{const entry=queued||lastSent;if(!entry)return;const data=entry.data;const blob=new Blob([JSON.stringify({version:1,data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='crm-modifications-non-synchronisees.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 reload.onclick=()=>{if(!confirm('Abandonner les modifications non synchronisées et recharger les données enregistrées ? Téléchargez-les d’abord si nécessaire.'))return;show('Rechargement…');port.postMessage({type:'reload'})};
 function start(data,channel,name){
  port=channel;const items=new Map([['pulse-crm-v2',JSON.stringify(data)],['bb-crm-settings-v1',JSON.stringify(data.__saas_settings||{})],['bb-crm-goals-v1',JSON.stringify(data.__saas_goals||{})]]);
  const memory={getItem:k=>items.has(String(k))?items.get(String(k)):null,setItem:(k,v)=>{k=String(k);items.set(k,String(v));if(ready&&(k==='bb-crm-settings-v1'||k==='bb-crm-goals-v1')){db[k==='bb-crm-settings-v1'?'__saas_settings':'__saas_goals']=JSON.parse(v);save()}},removeItem:k=>items.delete(String(k)),clear:()=>items.clear(),key:i=>[...items.keys()][i]??null,get length(){return items.size}};
  Object.defineProperty(window,'localStorage',{value:memory,configurable:false,writable:false});
  window.crmCloudOnSave=save;window.saasBackup=(action,payload={})=>new Promise((resolve,reject)=>{const id=++backupSequence;const timer=setTimeout(()=>{backupRequests.delete(id);reject(Error('La sauvegarde ne répond pas'))},120000);backupRequests.set(id,{resolve,reject,timer});port.postMessage({type:'backup-request',id,action,payload})});
  port.onmessage=event=>{const message=event.data||{};
   if(message.type==='backup-result'){const request=backupRequests.get(message.id);if(request){backupRequests.delete(message.id);clearTimeout(request.timer);if(message.error)request.reject(Error(message.error));else request.resolve(message.data)}}
   else if(message.type==='capture'){const pending=queued||lastSent;port.postMessage({type:'captured',id:message.id,data:pending?.data||null,sequence:pending?.sequence||0})}
   else if(message.type==='saved'){inFlight=false;if(queued){sendNext();return}lastSent=null;try{replaceData(message.data);hide();port.postMessage({type:'rendered'})}catch{blocked=true;show('Enregistré, mais affichage impossible. Rechargez la page.',true)}}
   else if(message.type==='save-error'){inFlight=false;blocked=true;show('Modifications non confirmées : '+String(message.message||'erreur de synchronisation')+'. Téléchargez-les avant de recharger.',true)}
   else if(message.type==='reloaded'){inFlight=false;blocked=false;queued=null;lastSent=null;try{replaceData(message.data);hide();port.postMessage({type:'rendered'})}catch{blocked=true;show('Rechargement impossible.',true)}}
   else if(message.type==='reload-error'){blocked=true;show('Rechargement impossible : '+String(message.message||'erreur'),true)}
   else if(message.type==='access-lost'){blocked=true;show('Session interrompue. Téléchargez les modifications non synchronisées.',true)}
  };
  const load=src=>new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>reject(Error('Ressource indisponible'));document.body.append(tag)});
  (async()=>{for(const src of scripts)await load(src);document.querySelector('.topbar h1').textContent=typeof name==='string'&&name.trim()?name:'CRM';const section=document.createElement('section');section.className='panel form';const heading=document.createElement('h3');heading.textContent='Collaborateurs';const manage=document.createElement('button');manage.type='button';manage.textContent='Gérer les collaborateurs';manage.onclick=()=>port.postMessage({type:'manage-members'});section.append(heading,manage);document.getElementById('settings-view').prepend(section);document.body.append(overlay);ready=true;port.postMessage({type:'loaded'})})().catch(()=>port.postMessage({type:'load-error'}));
 }
 addEventListener('message',event=>{if(started||event.source!==parent||event.origin!==new URL(document.baseURI).origin||event.data?.type!=='crm-live-start'||event.ports.length!==1)return;event.stopImmediatePropagation();started=true;start(event.data.data,event.ports[0],event.data.name)},true);
 parent.postMessage({type:'crm-live-ready'},'*');
})();
