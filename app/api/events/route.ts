import {actor} from '@/lib/auth';import {readBookings} from '@/models/read';import {realtimeServer} from '@/connections/realtime';
/** Same-origin authenticated SSE. The server subscribes to Supabase Realtime and emits ONLY invalidation notices, never row data. */
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 const u=await actor();if(!u)return new Response('Unauthorized',{status:401});
 const allowedBookings=u.role==='CLIENT'?new Set((await readBookings(u)).map(b=>b.id)):null;
 let client:ReturnType<typeof realtimeServer>;
 try{client=realtimeServer();}catch{return new Response('Realtime unavailable',{status:503});}
 const encoder=new TextEncoder();let heartbeat:ReturnType<typeof setInterval>|undefined;let closed=false;
 const stream=new ReadableStream<Uint8Array>({
  start(controller){
   const push=(kind:string)=>{if(!closed){try{controller.enqueue(encoder.encode(`event: change\ndata: ${JSON.stringify({kind})}\n\n`));}catch{}}};
   const relevant=(table:string,payload:{new?:Record<string,unknown>;old?:Record<string,unknown>})=>{
    if(u.role!=='CLIENT')return true;
    if(table==='bookings')return payload.new?.client_id===u.id;
    if(table==='messages'||table==='booking_history')return allowedBookings?.has(String(payload.new?.booking_id||''))||false;
    return table==='packages'||table==='site_content';
   };
   const channel=client.channel(`dm-sse-${u.id}-${crypto.randomUUID()}`);
   for(const table of ['bookings','messages','booking_history','packages','site_content']){
    channel.on('postgres_changes',{event:'*',schema:'public',table},(payload)=>{if(relevant(table,payload as any))push(table);});
   }
   channel.subscribe(s=>{if(s==='SUBSCRIBED')push('connected');});
   controller.enqueue(encoder.encode(': connected\n\n'));
   heartbeat=setInterval(()=>{if(!closed){try{controller.enqueue(encoder.encode(': keepalive\n\n'));}catch{}}},25000);
   const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);void client.removeChannel(channel);try{controller.close();}catch{}};
   req.signal.addEventListener('abort',close,{once:true});
  },
  cancel(){closed=true;clearInterval(heartbeat);void client.removeAllChannels();}
 });
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
}
