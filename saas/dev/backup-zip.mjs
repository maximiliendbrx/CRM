import {SOURCE_FILES} from './source-manifest.mjs';
const GUIDE=`B&B CRM — sauvegarde complète

Le dossier donnees-privees contient des informations commerciales confidentielles. Ne le publiez pas et ne partagez pas cette archive sans précaution.
Le dossier site contient une copie des fichiers de l'application. Le dossier saas/dev correspond à la version multi-utilisateur expérimentale ; sa réinstallation exige un projet Supabase, ses migrations, ses paramètres d'authentification et un hébergement HTTPS compatible. Elle n'est pas automatique.
Cette archive ne contient ni mot de passe, ni clé secrète Supabase, ni sauvegarde complète de l'infrastructure ou des comptes Auth. La restauration de données sur une autre installation doit être vérifiée avant utilisation.
`;
export async function buildBackupArchive({backup,baseUrl,fetcher=fetch,Zip=globalThis.JSZip}){
 if(!backup||!backup.data||typeof backup.data!=='object'||Array.isArray(backup.data)||!Number.isFinite(Date.parse(backup.createdAt)))throw Error('Sauvegarde invalide');
 if(typeof Zip!=='function')throw Error('Compression indisponible');const base=new URL(baseUrl);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('Adresse du site invalide');
 const archive=new Zip(),site=archive.folder('site');let total=0;
 await Promise.all(SOURCE_FILES.map(async path=>{if(!/^[a-zA-Z0-9_./-]+$/.test(path)||path.includes('..'))throw Error('Chemin de fichier invalide');const url=new URL(path,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('Fichier hors du site');const response=await fetcher(url.href,{cache:'no-store'});if(!response.ok)throw Error('Un fichier de code est indisponible : '+path);const bytes=await response.arrayBuffer();total+=bytes.byteLength;if(total>64*1024*1024)throw Error('Code trop volumineux');site.file(path,bytes)}));
 archive.file('donnees-privees/donnees.json',JSON.stringify({version:1,createdAt:backup.createdAt,data:backup.data},null,2));archive.file('LISEZ-MOI.txt',GUIDE);return archive.generateAsync({type:'blob'});
}
