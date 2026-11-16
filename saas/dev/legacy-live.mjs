// Génère un cadre isolé pour les essais d'écriture : aucune donnée dans le HTML.
export function createLegacyLive(html,baseUrl){
 const base=new URL(baseUrl);
 if(!['https:','http:'].includes(base.protocol)||base.username||base.password)throw Error('Adresse du site invalide');
 if(!/^<!doctype html>/i.test(html)||!html.includes('id="contacts-view"')||!html.includes('</body>'))throw Error('Fichier du CRM invalide');
 const csp=`default-src 'none'; script-src ${base.origin}; style-src ${base.origin} 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri ${base.origin}`;
 const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'');
 return clean.replace('<head>',`<head><base href="${base.href}"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>#cloud-panel {display:none!important}</style>`).replace('</body>','<script src="saas/dev/legacy-live.js"></script></body>');
}
