import {createClient} from '@supabase/supabase-js';
/** Server-only subscription; service key is never exposed to browser. */
export function realtimeServer(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Supabase Realtime credentials are not configured');
 return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
