// Sauvegardes propres à un compte et à un espace, dans ce navigateur uniquement.
const idPattern=/^[0-9a-z-]{1,128}$/i;
export class LocalBackupStore {
 #client;#userId;#workspace;#storage;#locks;#clock;#uuid;#key;
 constructor({client,userId,workspace,storage=localStorage,locks=navigator.locks,clock=()=>new Date(),uuid=()=>crypto.randomUUID()}){
  if(!client?.auth?.getUser||!idPattern.test(userId)||!idPattern.test(workspace))throw Error('Contexte de sauvegarde invalide');
  this.#client=client;this.#userId=userId;this.#workspace=workspace;this.#storage=storage;this.#locks=locks;this.#clock=clock;this.#uuid=uuid;this.#key=`bb-crm-saas-backups:${userId}:${workspace}`;
 }
 async #verify(){const result=await this.#client.auth.getUser();if(result.error||result.data?.user?.id!==this.#userId)throw Error('Session expirée : sauvegarde indisponible')}
 #read(){const raw=this.#storage.getItem(this.#key);if(!raw)return [];const items=JSON.parse(raw);if(!Array.isArray(items)||items.some(x=>!x||!x.id||!Number.isFinite(Date.parse(x.createdAt))||!x.data||typeof x.data!=='object'||Array.isArray(x.data)))throw Error('Sauvegardes locales illisibles');return items}
 async list(){if(!this.#locks?.request)throw Error('Sauvegarde locale indisponible : verrouillage entre onglets non pris en charge');return this.#locks.request(this.#key,async()=>{await this.#verify();const all=this.#read(),cutoff=this.#clock().getTime()-10*86400000,kept=all.filter(item=>Date.parse(item.createdAt)>=cutoff);if(kept.length!==all.length)this.#storage.setItem(this.#key,JSON.stringify(kept));return structuredClone(kept)})}
 async create({kind,data,due}){
  if(!['auto','manual'].includes(kind)||!data||typeof data!=='object'||Array.isArray(data))throw Error('Sauvegarde invalide');
  if(kind==='auto'&&(!due||!Number.isFinite(Date.parse(due))))throw Error('Heure de sauvegarde invalide');
  if(!this.#locks?.request)throw Error('Sauvegarde locale indisponible : verrouillage entre onglets non pris en charge');
  return this.#locks.request(this.#key,async()=>{await this.#verify();const now=this.#clock();if(!Number.isFinite(now.getTime()))throw Error('Date invalide');const existing=this.#read(),cutoff=now.getTime()-10*86400000,kept=existing.filter(x=>Date.parse(x.createdAt)>=cutoff);
   if(kind==='auto'){const previous=kept.find(x=>x.kind==='auto'&&Date.parse(x.createdAt)>=Date.parse(due));if(previous)return structuredClone(previous)}
   const backup={id:this.#uuid(),createdAt:now.toISOString(),kind,data:structuredClone(data)};const encoded=JSON.stringify([backup,...kept]);if(encoded.length>10*1024*1024)throw Error('Espace de sauvegarde local insuffisant');this.#storage.setItem(this.#key,encoded);return structuredClone(backup)
  });
 }
}
