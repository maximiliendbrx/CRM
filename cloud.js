/* Connexion obligatoire et synchronisation du CRM partagé (Supabase).
   Les données ne sont chargées qu'après connexion ; la protection réelle repose sur les règles RLS de la base.
   Aucune inscription n'est proposée : les accès sont créés par l'administrateur (fonction serveur manage-members). */
(function(){
 const DIRTY='bb-crm-cloud-pending-v1',IMPORT='bb-crm-precloud-data-v1',BACKUPS='bb-crm-backups-v1',OLD_CONFIG='bb-crm-cloud-config-v1';
 const COLLECTIONS=['contacts','interactions','followups','companies','coldCalls','projects'];
 const root=document.documentElement,el=id=>document.getElementById(id);
 let client=null,user=null,role=null,owner=null,remoteVersion=null,base=null,ready=false,busy=false,changed=false;
 const safe=fn=>{try{return fn()}catch{return undefined}};
 const notice=text=>{el('cloud-status').textContent=text};
 const valid=data=>data&&['contacts','interactions','followups'].every(k=>Array.isArray(data[k]));
 const copy=()=>structuredClone(db);
 const dirty=()=>safe(()=>localStorage.setItem(DIRTY,'1')),clearDirty=()=>safe(()=>localStorage.removeItem(DIRTY)),isDirty=()=>!!safe(()=>localStorage.getItem(DIRTY));
 const persist=()=>safe(()=>localStorage.setItem(KEY,JSON.stringify(db)));
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

 // ---------- Écran de connexion ----------
 function showGate(which,message,isError){
  root.classList.add('locked');el('auth-login-form').hidden=which!=='login';el('auth-newpass-form').hidden=which!=='newpass';
  const text=el('auth-message');text.textContent=message||'';text.classList.toggle('auth-error',!!isError);text.hidden=!message;
 }
 function unlock(){root.classList.remove('locked');root.dataset.role=role||'';safe(()=>checkAutomaticBackup())}
 function accountInfo(){el('account-info').textContent=user?`Connecté : ${user.email} · ${role==='admin'?'Administrateur':'Membre'}`:''}

 // ---------- Fusion enregistrement par enregistrement (base = dernier état synchronisé) ----------
 const stable=value=>JSON.stringify(value,(key,val)=>val&&typeof val==='object'&&!Array.isArray(val)?Object.fromEntries(Object.entries(val).sort(([a],[b])=>a<b?-1:a>b?1:0)):val);
 const keyOf=item=>item&&typeof item==='object'?(item.id??('name:'+String(item.name||'').trim().toLocaleLowerCase('fr'))):String(item);
 const toMap=list=>new Map((Array.isArray(list)?list:[]).map(item=>[keyOf(item),item]));
 function merge3(baseData,local,remote){
  const out={...remote,...local};
  for(const name of COLLECTIONS){
   if(!Array.isArray(local[name])&&!Array.isArray(remote[name]))continue;
   const b=toMap(baseData?.[name]),l=toMap(local[name]),r=toMap(remote[name]),result=[];
   const decide=key=>{
    const inL=l.has(key),inR=r.has(key),inB=b.has(key);
    if(!inB){return inL?l.get(key):r.get(key)}
    const changedLocal=inL&&stable(l.get(key))!==stable(b.get(key)),changedRemote=inR&&stable(r.get(key))!==stable(b.get(key));
    if(inL&&inR)return changedLocal?l.get(key):r.get(key);
    if(inL)return changedLocal?l.get(key):undefined;   // supprimé ailleurs : une modification locale l'emporte
    if(inR)return changedRemote?r.get(key):undefined;  // supprimé ici : une modification distante l'emporte
    return undefined;
   };
   for(const key of r.keys()){const item=decide(key);if(item!==undefined)result.push(item)}
   for(const key of l.keys()){if(!r.has(key)){const item=decide(key);if(item!==undefined)result.push(item)}}
   out[name]=result;
  }
  return out;
 }
 window.crmCloudMerge=merge3;

 // ---------- Synchronisation ----------
 async function pull(){const {data,error}=await client.from('crm_data').select('owner_id,payload,updated_at').maybeSingle();if(error)throw error;return data}
 function adopt(row){
  if(!safe(()=>localStorage.getItem(IMPORT))&&db.contacts.length)safe(()=>localStorage.setItem(IMPORT,JSON.stringify(copy())));
  db=structuredClone(row.payload);persist();owner=row.owner_id;remoteVersion=row.updated_at;base=structuredClone(row.payload);clearDirty();
  if(selected&&!db.contacts.some(c=>c.id===selected))selected=null;render();
 }
 async function sync(){
  try{
   const row=await pull();
   if(!row){owner=user.id;remoteVersion=null;base=null;ready=true;const hasLocal=db.contacts.length+db.interactions.length+db.followups.length>0;if(role==='admin'&&hasLocal){dirty();await upload()}notice(hasLocal?'Données locales envoyées vers le cloud.':'Base cloud vide.');return true}
   if(!valid(row.payload))throw Error('Format des données distantes invalide');
   if(isDirty()){owner=row.owner_id;remoteVersion=row.updated_at;base=null;ready=true;mergeRemote(row);changed=true;await upload()}
   else{adopt(row);ready=true;notice('Synchronisé — '+db.contacts.length+' contact(s).')}
   return true;
  }catch(error){notice('Lecture distante impossible : '+error.message);return false}
 }
 function mergeRemote(row){
  db=merge3(base,db,row.payload);persist();remoteVersion=row.updated_at;base=structuredClone(row.payload);
  if(selected&&!db.contacts.some(c=>c.id===selected))selected=null;render();
 }
 async function upload(){
  if(!user||!ready)return;changed=true;if(busy)return;busy=true;let conflicts=0;
  try{
   while(changed){
    changed=false;const snapshot=copy(),stamp=new Date().toISOString();
    const query=remoteVersion===null?client.from('crm_data').insert({owner_id:user.id,payload:snapshot,updated_at:stamp}):client.from('crm_data').update({payload:snapshot,updated_at:stamp}).eq('owner_id',owner).eq('updated_at',remoteVersion);
    const {data,error}=await query.select('updated_at').maybeSingle();
    if(error)throw error;
    if(!data){ // quelqu'un d'autre a enregistré entre-temps : fusion puis nouvel envoi
     if(++conflicts>5)throw Error('Conflit de synchronisation répété.');
     const row=await pull();if(!row||!valid(row.payload))throw Error('Données distantes introuvables.');
     mergeRemote(row);changed=true;continue;
    }
    owner=owner||user.id;remoteVersion=data.updated_at;base=snapshot;
    if(!changed)clearDirty();
   }
   notice('Modifications enregistrées sur Supabase.');
  }catch(error){dirty();notice('Synchronisation échouée : '+error.message+' — copie locale conservée.')}finally{busy=false}
 }
 async function refresh(manual){
  if(!user||!ready||busy)return;
  if(isDirty()){await upload();return}
  busy=true;
  try{const row=await pull();if(row&&valid(row.payload)&&row.updated_at!==remoteVersion){adopt(row);notice('Données mises à jour depuis le cloud.')}else if(manual)notice('Déjà à jour.')}
  catch(error){notice('Actualisation impossible : '+error.message)}finally{busy=false}
 }
 window.crmCloudOnSave=()=>{if(!user)return;dirty();if(!ready)return;changed=true;upload()};

 // ---------- Ouverture de session ----------
 async function rejectAccess(message){safe(()=>client.auth.signOut());user=null;role=null;ready=false;showGate('login',message,true)}
 async function afterLogin(signedIn){
  user=signedIn;showGate('none','Chargement…');
  const {data:member,error}=await client.from('crm_members').select('role').eq('user_id',signedIn.id).maybeSingle();
  if(error){await rejectAccess('Impossible de vérifier votre accès : '+error.message);return}
  if(!member){await rejectAccess('Ce compte n’a pas accès au CRM. Contactez l’administrateur.');return}
  role=member.role;
  if(signedIn.user_metadata?.must_change_password){showGate('newpass','Votre mot de passe est temporaire : choisissez-en un nouveau pour continuer.');return}
  await startSession();
 }
 async function startSession(){
  if(!await sync()){const reason=el('cloud-status').textContent;await rejectAccess(reason||'Chargement des données impossible.');return}
  accountInfo();unlock();if(role==='admin')loadMembers();
 }
 async function init(){
  safe(()=>localStorage.removeItem(OLD_CONFIG));
  const config=window.CRM_SUPABASE;
  if(!config?.url||!config?.key){showGate('none','Configuration de la connexion manquante.',true);return}
  if(!window.supabase?.createClient){showGate('none','Service de connexion indisponible. Vérifiez votre connexion Internet puis rechargez la page.',true);return}
  client=window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  try{
   const {data,error}=await client.auth.getUser();
   if(data?.user)await afterLogin(data.user);
   else showGate('login',error&&error.name==='AuthRetryableFetchError'?'Connexion au service impossible. Vérifiez votre connexion.':'',!!error&&error.name==='AuthRetryableFetchError');
  }catch(error){showGate('login','Connexion au service impossible : '+error.message,true)}
 }
 const passwordProblem=(a,b)=>a.length<8?'Le mot de passe doit contenir au moins 8 caractères.':a!==b?'Les deux mots de passe ne correspondent pas.':/^(.)\1+$/.test(a)?'Choisissez un mot de passe moins simple.':'';

 el('auth-login-form').onsubmit=async e=>{
  e.preventDefault();if(!client)return;const button=e.target.querySelector('button'),email=el('auth-email').value.trim(),password=el('auth-password').value;
  button.disabled=true;showGate('login','Connexion…');
  try{
   const {data,error}=await client.auth.signInWithPassword({email,password});el('auth-password').value='';
   if(error){await wait(600);showGate('login',/invalid|credentials/i.test(error.message)?'Identifiant ou mot de passe incorrect.':'Connexion impossible : '+error.message,true);return}
   await afterLogin(data.user);
  }catch(error){showGate('login','Connexion impossible : '+error.message,true)}finally{button.disabled=false}
 };
 el('auth-newpass-form').onsubmit=async e=>{
  e.preventDefault();const first=el('auth-new').value,second=el('auth-new2').value,problem=passwordProblem(first,second);
  if(problem){showGate('newpass',problem,true);return}
  const {data,error}=await client.auth.updateUser({password:first,data:{must_change_password:false}});
  el('auth-new').value='';el('auth-new2').value='';
  if(error){showGate('newpass','Changement impossible : '+error.message,true);return}
  user=data.user;await startSession();
 };

 // ---------- Compte (Paramètres) ----------
 el('account-password-form').onsubmit=async e=>{
  e.preventDefault();const message=el('account-password-message'),first=el('account-new').value,second=el('account-new2').value,problem=passwordProblem(first,second);
  if(problem){message.textContent=problem;return}
  const {data,error}=await client.auth.updateUser({password:first,data:{must_change_password:false}});
  if(error){message.textContent='Changement impossible : '+error.message;return}
  user=data.user||user;el('account-new').value='';el('account-new2').value='';message.textContent='Mot de passe modifié.';
 };
 el('cloud-refresh').onclick=()=>refresh(true);
 el('cloud-logout').onclick=()=>showDataConfirmation({
  title:'Se déconnecter ?',
  description:'Vos données restent dans le cloud. Les copies de cet appareil (données et sauvegardes automatiques) seront effacées.'+(isDirty()?' Des modifications ne sont pas encore synchronisées : elles seront perdues.':''),
  confirmLabel:'Se déconnecter',
  onConfirm:async()=>{
   if(isDirty()&&ready)await upload();
   await safe(()=>client.auth.signOut());
   for(const key of [KEY,IMPORT,BACKUPS,DIRTY])safe(()=>localStorage.removeItem(key));
   location.reload();
  }});

 // ---------- Administration des accès ----------
 async function callAdmin(body){
  const {data,error}=await client.functions.invoke('manage-members',{body});
  if(error){let message=error.message;try{const detail=await error.context.json();if(detail?.error)message=detail.error}catch{}throw Error(message)}
  if(data?.error)throw Error(data.error);
  return data;
 }
 function showCredentials(title,email,password){
  const dialog=document.createElement('dialog');dialog.className='confirm-dialog';dialog.setAttribute('aria-labelledby','cred-title');
  const heading=document.createElement('h3');heading.id='cred-title';heading.textContent=title;
  const intro=document.createElement('p');intro.textContent='Transmettez ces identifiants à la personne par un canal sûr. Ce mot de passe n’est affiché qu’une seule fois ; elle devra le changer à sa première connexion.';
  const box=document.createElement('pre');box.className='credentials';box.textContent=`Site : ${location.origin}${location.pathname}\nIdentifiant : ${email}\nMot de passe temporaire : ${password}`;
  const actions=document.createElement('div');actions.className='dialog-actions';
  const copyButton=document.createElement('button');copyButton.type='button';copyButton.textContent='Copier';
  const close=document.createElement('button');close.type='button';close.className='close';close.textContent='Fermer';
  copyButton.onclick=async()=>{try{await navigator.clipboard.writeText(box.textContent);copyButton.textContent='Copié'}catch{copyButton.textContent='Copie impossible : sélectionnez le texte'}};
  close.onclick=()=>dialog.close();actions.append(copyButton,close);dialog.append(heading,intro,box,actions);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
 }
 async function loadMembers(){
  const list=el('admin-members'),message=el('admin-message');
  try{
   const {members}=await callAdmin({action:'list'});list.replaceChildren();
   for(const member of members){
    const row=document.createElement('div'),info=document.createElement('span'),actions=document.createElement('div');row.className='backup-row';
    info.textContent=`${member.email} — ${member.role==='admin'?'Administrateur':'Membre'} — dernière connexion : ${member.lastSignIn?new Date(member.lastSignIn).toLocaleString('fr-FR'):'jamais'}`;
    if(member.role!=='admin'){
     const reset=document.createElement('button'),remove=document.createElement('button');reset.type=remove.type='button';reset.className='close';remove.className='delete';reset.textContent='Nouveau mot de passe';remove.textContent='Supprimer l’accès';
     reset.onclick=async()=>{try{const result=await callAdmin({action:'reset',userId:member.userId});showCredentials('Nouveau mot de passe temporaire',result.email,result.password)}catch(error){message.textContent=error.message}};
     remove.onclick=()=>showDataConfirmation({title:'Supprimer cet accès ?',description:member.email+' ne pourra plus se connecter. Les données du CRM ne sont pas supprimées.',confirmLabel:'Supprimer l’accès',onConfirm:async()=>{try{await callAdmin({action:'remove',userId:member.userId});message.textContent='Accès supprimé.';loadMembers()}catch(error){message.textContent=error.message}}});
     actions.append(reset,remove);
    }
    row.append(info,actions);list.append(row);
   }
  }catch(error){message.textContent='Liste des utilisateurs indisponible : '+error.message}
 }
 el('admin-invite-form').onsubmit=async e=>{
  e.preventDefault();const message=el('admin-message'),email=el('admin-invite-email').value.trim();message.textContent='Création de l’accès…';
  try{const result=await callAdmin({action:'invite',email});el('admin-invite-email').value='';message.textContent='Accès créé pour '+result.email+'.';showCredentials('Accès créé',result.email,result.password);loadMembers()}
  catch(error){message.textContent=error.message}
 };

 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(false)});
 setInterval(()=>{if(!document.hidden)refresh(false)},120000);
 init();
})();
