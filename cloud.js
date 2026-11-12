/* Synchronisation facultative : aucune donnée envoyée sans connexion et import explicite. */
(function(){
 const CFG='bb-crm-cloud-config-v1',DIRTY='bb-crm-cloud-pending-v1';
 let client=null,user=null,busy=false,ready=false,remoteVersion=null,changed=false,timer=null;
 const el=id=>document.getElementById(id),notice=s=>{el('cloud-status').textContent=s};
 const valid=data=>data&&['contacts','interactions','followups'].every(k=>Array.isArray(data[k]));
 const copy=()=>structuredClone(db);
 const dirty=()=>localStorage.setItem(DIRTY,'1');
 const clearDirty=()=>localStorage.removeItem(DIRTY);
 const configured=()=>{try{return JSON.parse(localStorage.getItem(CFG)||'null')}catch{return null}};
 function renderState(){el('cloud-login').hidden=!client||!!user;el('cloud-actions').hidden=!user;el('cloud-setup').hidden=!!client;el('cloud-import').disabled=!user;el('cloud-refresh').disabled=!user}
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
    db=structuredClone(data.payload);localStorage.setItem(KEY,JSON.stringify(db));remoteVersion=data.updated_at;selected=null;render();ready=true;notice('Synchronisé avec Supabase — '+db.contacts.length+' contact(s).');
   }else{remoteVersion=null;ready=true;notice('Base cloud vide. Sur le PC contenant les contacts, utilisez « Importer les données locales ».');}
  }catch(e){notice('Lecture distante impossible : '+e.message)}finally{busy=false}
 }
 async function upload(){
  if(!user||!ready)return;changed=true;if(busy)return;busy=true;
  try{
   while(changed){changed=false;let snapshot=copy();
    const {data,error}=await client.from('crm_data').upsert({owner_id:user.id,payload:snapshot},{onConflict:'owner_id'}).select('updated_at').single();
    if(error)throw error;remoteVersion=data.updated_at;clearDirty();
   }
   notice('Modifications enregistrées sur Supabase.');
  }catch(e){dirty();notice('Synchronisation échouée : '+e.message+' — copie locale conservée.')}finally{busy=false}
 }
 window.crmCloudOnSave=()=>{if(!user||!ready)return;dirty();changed=true;upload()};
 el('cloud-config-form').onsubmit=async e=>{
  e.preventDefault();const url=el('cloud-url').value.trim().replace(/\/$/,'');const key=el('cloud-key').value.trim();
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key){notice('URL Supabase ou clé publique invalide.');return}
  localStorage.setItem(CFG,JSON.stringify({url,key}));client=null;user=null;ready=false;await init();
 };
 el('cloud-login-form').onsubmit=async e=>{
  e.preventDefault();if(!client)return;const email=el('cloud-email').value.trim(),password=el('cloud-password').value;
  const {data,error}=await client.auth.signInWithPassword({email,password});el('cloud-password').value='';
  if(error){notice('Connexion refusée : '+error.message);return}
  user=data.user;ready=false;renderState();await load();
 };
 el('cloud-import').onclick=async()=>{
  if(!user||!ready)return;
  if(!confirm('Importer les données présentes dans CE navigateur vers le cloud ? Faites-le depuis le PC qui contient les contacts. En cas de base distante déjà renseignée, son contenu pourrait être remplacé.'))return;
  if(remoteVersion){notice('Import bloqué : le cloud contient déjà des données. Ne pas remplacer sans sauvegarde et fusion contrôlée.');return}
  dirty();changed=true;await upload();
 };
 el('cloud-refresh').onclick=async()=>{if(!confirm('Charger la base distante ? Les données locales non importées pourraient être remplacées.'))return;await load()};
 el('cloud-logout').onclick=async()=>{if(!client)return;await client.auth.signOut();user=null;ready=false;renderState();notice('Déconnecté. Les données locales restent sur cet appareil.')};
 el('cloud-reset').onclick=()=>{if(!confirm('Retirer la configuration Supabase de cet ordinateur ? Aucune donnée ne sera supprimée.'))return;localStorage.removeItem(CFG);location.reload()};
 init();
})();
