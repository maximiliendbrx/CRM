// Coordination du modèle authentifié avec l'interface historique isolée.
import {WorkspaceModel} from '../workspace-model.mjs';
import {createLegacyLive} from './legacy-live.mjs';
import {LocalBackupStore} from './backup-store.mjs';
import {buildBackupArchive} from './backup-zip.mjs';
export class LiveController {
 #frame;#model;#snapshot;#port=null;#handler=null;#pending=null;#latestSequence=0;#disposed=false;#onState;#backups;#base;#probes=new Map();#probeId=0;
 constructor({frame,client,workspace,userId,onState=()=>{}}){this.#frame=frame;this.#model=new WorkspaceModel(client,workspace,userId);this.#backups=new LocalBackupStore({client,workspace,userId});this.#onState=onState}
 get hasPending(){return this.#pending!==null}
 getPending(){return this.#pending?structuredClone(this.#pending):null}
 async capturePending(){if(!this.#port||this.#disposed)return this.getPending();const id=++this.#probeId;return new Promise(resolve=>{const timer=setTimeout(()=>{this.#probes.delete(id);resolve(this.getPending())},1500);this.#probes.set(id,data=>{clearTimeout(timer);resolve(data||this.getPending())});this.#port.postMessage({type:'capture',id})})}
 async start(html,base){
  this.#base=base;this.#snapshot=await this.#model.load();if(this.#disposed)throw Error('Espace fermé');
  this.#handler=event=>{
   if(this.#disposed||event.source!==this.#frame.contentWindow||event.origin!=='null'||event.data?.type!=='crm-live-ready'||this.#port)return;
   const channel=new MessageChannel();this.#port=channel.port1;this.#port.onmessage=e=>void this.#handle(e.data);this.#frame.contentWindow.postMessage({type:'crm-live-start',data:this.#snapshot},'*',[channel.port2]);this.#snapshot=null;
  };
  addEventListener('message',this.#handler);this.#frame.srcdoc=createLegacyLive(html,base);this.#frame.hidden=false;
 }
 async #handle(message){
  if(this.#disposed||!message||typeof message!=='object')return;
  if(message.type==='backup-request'){if(!Number.isSafeInteger(message.id)||message.id<1)return;try{let data;if(message.action==='list')data=await this.#backups.list();else if(message.action==='create')data=await this.#backups.create(message.payload||{});else if(message.action==='download'){const backups=await this.#backups.list(),backup=backups.find(item=>item.id===message.payload?.backup?.id);if(!backup)throw Error('Sauvegarde introuvable');const blob=await buildBackupArchive({backup,baseUrl:this.#base});if(this.#disposed)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`bb-crm-complet-${backup.createdAt.replace(/[:.]/g,'-')}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);data=true}else throw Error('Action de sauvegarde indisponible');if(!this.#disposed)this.#port.postMessage({type:'backup-result',id:message.id,data})}catch(error){if(!this.#disposed)this.#port.postMessage({type:'backup-result',id:message.id,error:error.message})}return}
  if(message.type==='captured'){const done=this.#probes.get(message.id);if(done){this.#probes.delete(message.id);done(message.data?structuredClone(message.data):null)}return}
  if(message.type==='manage-members'){if(!this.#pending)this.#onState('manage');return}
  if(message.type==='loaded'){this.#onState('ready');return}
  if(message.type==='rendered'){if(!this.#pending)this.#onState('ready');return}
  if(message.type==='load-error'){this.#onState('error','Chargement du CRM impossible');return}
  if(message.type==='dirty'){
   if(!Number.isSafeInteger(message.sequence)||message.sequence<=this.#latestSequence||!message.data||typeof message.data!=='object')return;
   this.#latestSequence=message.sequence;this.#pending=structuredClone(message.data);this.#onState('pending');return;
  }
  if(message.type==='save'){
   if(!Number.isSafeInteger(message.sequence)||message.sequence>this.#latestSequence||!this.#pending)return;
   try{const result=await this.#model.save(message.data);if(this.#disposed)return;if(message.sequence===this.#latestSequence)this.#pending=null;this.#port.postMessage({type:'saved',data:result,sequence:message.sequence});this.#onState('pending')}
   catch(error){if(!this.#disposed){this.#port.postMessage({type:'save-error',message:error.message});this.#onState('error',error.message)}}return;
  }
  if(message.type==='reload'){
   try{const result=await this.#model.load();if(this.#disposed)return;this.#pending=null;this.#port.postMessage({type:'reloaded',data:result});this.#onState('pending')}
   catch(error){if(!this.#disposed){this.#port.postMessage({type:'reload-error',message:error.message});this.#onState('error',error.message)}}
  }
 }
 close(){this.#disposed=true;for(const finish of this.#probes.values())finish(this.getPending());this.#probes.clear();this.#model.close();if(this.#handler)removeEventListener('message',this.#handler);this.#port?.close();this.#frame.hidden=true;this.#frame.removeAttribute('srcdoc')}
}
