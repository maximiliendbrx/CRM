// Primitives prévues pour un environnement serveur de confiance uniquement.
// Elles ne réalisent ni authentification ni accès à la base de données.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export function createInvitationToken(){return randomBytes(32).toString('base64url')}
export function hashInvitationToken(token){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('Jeton invalide');
 return createHash('sha256').update(token,'utf8').digest('hex');
}
export function verifyInvitationToken(token,expectedHash){
 if(typeof expectedHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedHash))return false;
 let actual;try{actual=Buffer.from(hashInvitationToken(token),'hex')}catch{return false}
 return timingSafeEqual(actual,Buffer.from(expectedHash,'hex'));
}
