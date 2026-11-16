// Modèle expérimental : une instance pour un utilisateur et un CRM, sans stockage local.
import {planWorkspaceChanges} from './workspace-changes.mjs';
import {WorkspaceWriter} from './workspace-writer.mjs';
const tables={companies:'companies',contacts:'contacts',interactions:'interactions',cold_calls:'coldCalls',reminders:'followups',projects:'projects'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function snapshotFromRecords(records,workspace){
 if(!records||typeof records!=='object'||Array.isArray(records)||!uuid.test(workspace)||records.settings?.workspace_id!==workspace||!records.settings.data||typeof records.settings.data!=='object'||Array.isArray(records.settings.data))throw Error('Réponse de paramètres invalide');
 const other=records.settings.data.legacy_extra||{};
 if(!other||typeof other!=='object'||Array.isArray(other)||Object.values(tables).some(key=>Object.hasOwn(other,key)))throw Error('Données supplémentaires invalides');
 const result=structuredClone(other);
 for(const [table,key] of Object.entries(tables)){
  if(!Array.isArray(records[table]))throw Error('Collection manquante : '+key);
  result[key]=records[table].map(row=>{if(!row||row.workspace_id!==workspace||!row.data||typeof row.data!=='object'||Array.isArray(row.data))throw Error('Données de collection invalides : '+key);return structuredClone(row.data)});
 }
 return result;
}
export class WorkspaceModel {
 #client;#workspace;#userId;#writer;#closed=false;#busy=false;#records=null;#baseline=null;
 constructor(client,workspace,userId){this.#writer=new WorkspaceWriter(client,workspace,userId);this.#client=client;this.#workspace=workspace;this.#userId=userId}
 close(){this.#closed=true;this.#records=null;this.#baseline=null;this.#writer.close()}
 async #read(){
  const before=await this.#client.auth.getUser();if(this.#closed||before.error||before.data?.user?.id!==this.#userId)throw Error('Session ou espace modifié');
  const result=await this.#client.rpc('get_workspace_records',{p_workspace:this.#workspace});
  if(this.#closed)throw Error('Espace fermé');if(result.error)throw Error('Lecture impossible : '+result.error.message);
  const after=await this.#client.auth.getUser();if(this.#closed||after.error||after.data?.user?.id!==this.#userId)throw Error('Session ou espace modifié');
  const snapshot=snapshotFromRecords(result.data,this.#workspace);
  this.#records=structuredClone(result.data);this.#baseline=snapshot;return structuredClone(snapshot);
 }
 async load(){if(this.#closed)throw Error('Espace fermé');if(this.#busy)throw Error('Opération en cours');this.#busy=true;try{return await this.#read()}finally{this.#busy=false}}
 async save(desired){
  if(this.#closed||!this.#records||!this.#baseline)throw Error('Rechargez le CRM avant de modifier ses données');
  if(this.#busy)throw Error('Opération en cours');this.#busy=true;
  try{
   const changes=planWorkspaceChanges(this.#baseline,this.#records,desired);
   if(!changes.length)return structuredClone(this.#baseline);
   // Après tout envoi, ne jamais rejouer sans relire : même une erreur réseau peut cacher un succès.
   let sent=false;try{sent=true;await this.#writer.apply(changes)}catch(error){if(sent){this.#records=null;this.#baseline=null}throw error}
   try{return await this.#read()}catch(error){this.#records=null;this.#baseline=null;throw Error('Enregistrement effectué, mais relecture impossible : rechargez avant de continuer')}
  }finally{this.#busy=false}
 }
}
