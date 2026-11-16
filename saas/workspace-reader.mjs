// Lecture isolée, sans cache ni écriture. Ne remplace pas les politiques RLS.
const collections=['companies','contacts','interactions','coldCalls','followups','projects'];
const validId = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export class WorkspaceReader {
 #client; #generation=0; #closed=false;
 constructor(client){if(!client?.auth?.getUser || !client?.rpc)throw Error('Client indisponible');this.#client=client}
 close(){this.#closed=true;this.#generation++}
 async read(workspaceId){
  if(this.#closed || !validId(workspaceId))throw Error('Espace invalide ou lecture fermée');
  const generation=++this.#generation;
  const ensureCurrent=()=>{if(this.#closed || generation!==this.#generation)throw Error('Lecture annulée : contexte modifié')};
  const identity=await this.#client.auth.getUser();ensureCurrent();
  if(identity.error || !identity.data?.user?.id)throw Error('Session expirée ou indisponible');
  const userId=identity.data.user.id;
  const snapshot=await this.#client.rpc('get_workspace_snapshot',{p_workspace:workspaceId});ensureCurrent();
  if(snapshot.error)throw Error('Lecture du CRM impossible : '+snapshot.error.message);
  const identityAfter=await this.#client.auth.getUser();ensureCurrent();
  if(identityAfter.error || identityAfter.data?.user?.id!==userId)throw Error('Session modifiée pendant la lecture');
  const data=snapshot.data;
  if(!data || typeof data!=='object' || Array.isArray(data) || collections.some(k=>!Array.isArray(data[k]) || data[k].some(item=>!item || typeof item!=='object' || Array.isArray(item))))throw Error('Données du CRM invalides');
  return structuredClone(data);
 }
}
