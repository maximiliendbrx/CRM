/* Synchronisation facultative : aucune donnée envoyée sans connexion et import explicite. */
(function(){
 const CFG='bb-crm-cloud-config-v1',DIRTY='bb-crm-cloud-pending-v1',IMPORT='bb-crm-precloud-data-v1';
 let client=null,user=null,busy=false,ready=false,remoteVersion=null,changed=false,timer=null,editing=false;
 const el=id=>document.getElementById(id),notice=s=>{el('cloud-status').textContent=s};
 const valid=data=>data&&['contacts','interactions','followups'].every(k=>Array.isArray(data[k]));
 const copy=()=>structuredClone(db);
 const dirty=()=>localStorage.setItem(DIRTY,'1');
 const clearDirty=()=>localStorage.removeItem(DIRTY);
 const configured=()=>{try{return JSON.parse(localStorage.getItem(CFG)||'null')}catch{return null}};
 function renderState(){el('cloud-login').hidden=!client||!!user;el('cloud-actions').hidden=!user;el('cloud-setup').hidden=!!client&&!editing;el('cloud-edit').hidden=!client||!!user||editing;el('cloud-import').disabled=!user;el('cloud-refresh').disabled=!user}
 async function init(){
   const cfg=configured();if(!cfg){notice('Mode local. Configurez Supabase pour synchroniser.');renderState();return}
   if(!window.supabase?.createClient){notice('Bibliothèque Supabase indisponible. Mode local uniquement.');return}
   try{client=window.supabase.createClient(cfg.url,cfg.key);const {data,error}=await client.auth.getUser();if(error&&error.name!=='AuthSessionMissingError')throw error;user=data?.user||null;renderState();if(user)await load();else notice('Configuration enregistrée. Connectez-vous pour synchroniser.')}
   catch(e){notice('Connexion Supabase impossible : '+e.message);renderState()}
 }
 async function load(){
  if(!client||!user||busy)return;busy=true;
  try{
   const {data,error}=await client.from('crm_data').select('payload,updated_at').eq('owner_id',user.id).maybeSingle();if(error)throw error;
   if(localStorage.getItem(DIRTY)){notice('Des modifications locales ne sont pas synchronisées. Ne rechargez pas la base distante avant de résoudre le problème.');return}
   if(data){if(!valid(data.payload))throw Error('Format des données distantes invalide');
    if(!localStorage.getItem(IMPORT)&&db.contacts.length)localStorage.setItem(IMPORT,JSON.stringify(copy()));
    db=structuredClone(data.payload);localStorage.setItem(KEY,JSON.stringify(db));remoteVersion=data.updated_at;selected=null;render();ready=true;notice('Synchronisé avec Supabase — '+db.contacts.length+' contact(s).');
   }else{remoteVersion=null;ready=true;notice('Base cloud vide. Les contacts locaux sont conservés : importez-les depuis le PC qui les contient.');}
  }catch(e){notice('Lecture distante impossible : '+e.message)}finally{busy=false}
 }
 async function upload(){
  if(!user||!ready)return;changed=true;if(busy)return;busy=true;
  try{
   while(changed){changed=false;let snapshot=copy();
    const timestamp=new Date().toISOString();
    const query=remoteVersion===null?client.from('crm_data').insert({owner_id:user.id,payload:snapshot,updated_at:timestamp}):client.from('crm_data').update({payload:snapshot,updated_at:timestamp}).eq('owner_id',user.id).eq('updated_at',remoteVersion);
    const {data,error}=await query.select('updated_at').maybeSingle();
    if(error)throw error;if(!data)throw Error('La base a changé sur un autre appareil. Synchronisation arrêtée pour éviter un écrasement ; téléchargez une sauvegarde locale avant de résoudre le conflit.');remoteVersion=data.updated_at;clearDirty();
   }
   notice('Modifications enregistrées sur Supabase.');
  }catch(e){dirty();notice('Synchronisation échouée : '+e.message+' — copie locale conservée.')}finally{busy=false}
 }
 window.crmCloudOnSave=()=>{if(!user||!ready)return;dirty();changed=true;upload()};
 el('cloud-config-form').onsubmit=async e=>{
  e.preventDefault();const url=el('cloud-url').value.trim().replace(/\/$/,'');const key=el('cloud-key').value.trim();
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key){notice('Renseignez l’URL du projet (https://….supabase.co) et sa clé publique.');return}
  let role='';try{role=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role||''}catch{}
  if(key.startsWith('sb_secret_')||role==='service_role'){notice('Cette clé est secrète. Utilisez uniquement la clé publishable ou anon.');return}
  try{localStorage.setItem(CFG,JSON.stringify({url,key}));client=null;user=null;ready=false;editing=false;await init()}catch{notice('Impossible d’enregistrer la configuration dans ce navigateur.')}
 };
 el('cloud-edit').onclick=()=>{const cfg=configured();editing=true;el('cloud-url').value=cfg?.url||'';el('cloud-key').value=cfg?.key||'';renderState();el('cloud-key').focus()};
 el('cloud-login-form').onsubmit=async e=>{
  e.preventDefault();if(!client)return;const email=el('cloud-email').value.trim(),password=el('cloud-password').value;
  if(db.contacts.length&&!localStorage.getItem(IMPORT))localStorage.setItem(IMPORT,JSON.stringify(copy()));
  const {data,error}=await client.auth.signInWithPassword({email,password});el('cloud-password').value='';
  if(error){notice('Connexion refusée : '+error.message);return}
  user=data.user;ready=false;renderState();await load();
 };
 el('cloud-import').onclick=async()=>{
  if(!user||!ready)return;
  if(!confirm('Importer les données sauvegardées sur CET ordinateur vers le cloud ? Faites-le depuis le PC qui contient vos contacts.'))return;
  if(remoteVersion){notice('Import bloqué : le cloud contient déjà des données. Ne pas remplacer sans sauvegarde et fusion contrôlée.');return}
  const original=localStorage.getItem(IMPORT);if(original){try{const parsed=JSON.parse(original);if(valid(parsed))db=parsed}catch{}}
  if(!valid(db)){notice('Données locales invalides. Import annulé.');return}
  localStorage.setItem(KEY,JSON.stringify(db));render();dirty();changed=true;await upload();
 };
 el('cloud-refresh').onclick=async()=>{if(!confirm('Charger la base distante ? Les données locales non importées pourraient être remplacées.'))return;await load()};
 el('cloud-logout').onclick=async()=>{if(!client)return;await client.auth.signOut();user=null;ready=false;renderState();notice('Déconnecté. Les données locales restent sur cet appareil.')};
 el('cloud-reset').onclick=()=>{if(!confirm('Retirer la configuration Supabase de cet ordinateur ? Aucune donnée ne sera supprimée.'))return;localStorage.removeItem(CFG);location.reload()};
 init();
})();
