import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
export class HttpError extends Error { constructor(public status:number, message:string){ super(message); } }
export function ok(data:unknown, status=200) {return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function fail(error:unknown) {
  if (error instanceof ZodError) return ok({error:'Validation failed',issues:error.flatten()},400);
  if (error instanceof HttpError) return ok({error:error.message},error.status);
  console.error('API error:',error);
  return ok({error:'An unexpected server error occurred.'},500);
}
export function guardOrigin(req:Request) {
  const origin=req.headers.get('origin');
  if (!origin) return; // non-browser requests still require session and authorization
  const sent=new URL(origin);
  const host=req.headers.get('x-forwarded-host')||req.headers.get('host');
  if(!host || sent.host!==host) throw new HttpError(403,'Invalid request origin');
}
export async function readJson(req:Request){
  if(!(req.headers.get('content-type')||'').includes('application/json')) throw new HttpError(415,'JSON content type required');
  return req.json().catch(()=>{throw new HttpError(400,'Invalid JSON');});
}
export function route(fn:(req:Request,ctx:any)=>Promise<Response>){ return async (req:Request,ctx:any) => {try {if(['POST','PATCH','PUT','DELETE'].includes(req.method)) guardOrigin(req);return await fn(req,ctx);}catch(e){return fail(e);}};}
