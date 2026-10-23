export async function api<T=any>(path:string,opts:RequestInit={}){
 const headers=new Headers(opts.headers);if(opts.body&&!(opts.body instanceof FormData))headers.set('Content-Type','application/json');
 const res=await fetch(path,{...opts,headers,cache:'no-store'});const body=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(body.error||`Request failed (${res.status})`);return body as T;
}
export const json=(method:'POST'|'PATCH'|'DELETE',body:unknown):RequestInit=>({method,body:JSON.stringify(body)});
