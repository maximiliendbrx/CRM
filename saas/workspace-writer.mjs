// Prototype : lot atomique par espace, aucune sauvegarde locale implicite.
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export class WorkspaceWriter {
 #client; #userId; #workspace; #closed=false; #busy=false;
 constructor(client,workspace,userId){if(!client?.auth?.getUser||!client?.rpc||!validId(workspace)||!userId)throw Error('Contexte invalide');this.#client=client;this.#workspace=workspace;this.#userId=userId}
 close(){this.#closed=true}
 async apply(changes){
  if(this.#closed)throw Error('Espace fermé');
  if(this.#busy)throw Error('Un enregistrement est déjà en cours');
  if(!Array.isArray(changes)||!changes.length||changes.length>500)throw Error('Lot de modifications invalide');
  this.#busy=true;let sent=false;
  try{
   const before=await this.#client.auth.getUser();
   if(this.#closed||before.error||before.data?.user?.id!==this.#userId)throw Error('Session ou espace modifié avant envoi');
   sent=true;
   const result=await this.#client.rpc('apply_workspace_changes',{p_workspace:this.#workspace,p_changes:structuredClone(changes)});
   if(result.error){if(/failed to fetch|networkerror|network request failed/i.test(result.error.message||''))throw new TypeError('Failed to fetch');throw Error(result.error.message)}
   const after=await this.#client.auth.getUser();
   if(this.#closed||after.error||after.data?.user?.id!==this.#userId)throw Error('Session ou espace modifié pendant l’enregistrement ; résultat à vérifier');
   if(!Array.isArray(result.data)||result.data.length!==changes.length)throw Error('Réponse inattendue ; résultat à vérifier');
   return structuredClone(result.data);
  }catch(error){
   // Une erreur réseau après l'envoi ne prouve pas que la transaction a échoué.
   if(sent && (error?.name==='TypeError'||error?.message==='Failed to fetch'))throw Error('Connexion interrompue : résultat incertain, rechargez les données avant de réessayer');
   throw error;
  }finally{this.#busy=false}
 }
}
