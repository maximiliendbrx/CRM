// Le fragment est capturé et retiré de l'URL avant le chargement du SDK externe.
(()=>{const url=new URL(location.href),token=new URLSearchParams(url.hash.slice(1)).get('invite');if(token&&/^[0-9a-f]{64}$/.test(token)){sessionStorage.setItem('bb-crm-dev-invitation',token);history.replaceState(null,'',url.pathname+url.search)}})();
