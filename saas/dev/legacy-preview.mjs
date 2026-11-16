// Construit un aperçu en iframe opaque ; ne transmet aucune donnée dans l'URL ou le HTML.
export function createLegacyPreview(html,baseUrl){
 const base=new URL(baseUrl);
 if(!['https:','http:'].includes(base.protocol)||base.username||base.password)throw Error('Adresse du site invalide');
 if(!/^<!doctype html>/i.test(html)||!html.includes('id="contacts-view"')||!html.includes('</body>'))throw Error('Fichier du CRM invalide');
 const csp=`default-src 'none'; script-src ${base.origin}; style-src ${base.origin} 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri ${base.origin}`;
 const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'');
 return clean.replace('<head>',`<head><base href="${base.href}"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>#contact-form,#interaction-form,#followup-form,#coldcall-form,#company-create,#project-form,#report-form,#settings-view form,#cloud-panel,.home-actions,.reset-section,button:not(.nav):not(.contact-link):not(.followup-title):not(#close):not(.company-close) {display:none!important}</style>`).replace('</body>','<script src="saas/dev/legacy-preview.js"></script></body>');
}
