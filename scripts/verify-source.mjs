import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
function assert(cond,msg){if(!cond){console.error('FAILED: '+msg);process.exitCode=1;}else console.log('PASS: '+msg)}
const pages=['/','/packages','/login','/register','/forgot-password','/reset-password','/verify-email','/privacy'];
const portal=['client','client/book','client/bookings','client/messages','client/profile','coordinator','coordinator/calendar','coordinator/requests','coordinator/messages','admin','admin/analytics','admin/bookings','admin/maintenance','admin/maintenance/packages','admin/maintenance/content','admin/maintenance/users','admin/maintenance/settings','admin/maintenance/backups'];
for(const r of pages)assert(existsSync(`app/(public)${r==='/'?'':r}/page.tsx`),'Public route '+r);
for(const r of portal)assert(existsSync(`app/(portal)/${r}/page.tsx`),'Portal route '+r);
const routes=['auth/register','auth/login','auth/logout','auth/forgot','auth/reset','bookings','messages','packages','analytics','users','uploads','events','content','settings','backups'];
for(const r of routes)assert(existsSync(`app/api/${r}/route.ts`),'API '+r);
const schema=readFileSync('src/db/schema.ts','utf8');
for(const name of ['users','sessions','authTokens','packages','mediaAssets','bookings','bookingHistory','messages','messageReads','siteContent','backupLogs','auditLogs'])assert(schema.includes(`export const ${name} =`)||schema.includes(`export const ${name}=`),'Database entity '+name);
const sql=readFileSync('drizzle/0001_security.sql','utf8');assert(sql.includes('ENABLE ROW LEVEL SECURITY')&&sql.includes('REVOKE ALL'),'Supabase private data protection');
const realtime=readFileSync('src/connections/realtime.ts','utf8');assert(realtime.includes('SUPABASE_SERVICE_ROLE_KEY'),'Server-side Realtime config');
const fs=await import('node:fs');
let n=0;function countFiles(base){for(const item of readdirSync(base,{withFileTypes:true})){const p=join(base,item.name);if(item.isDirectory())countFiles(p);else n++;}}countFiles('src');countFiles('app');
console.log('Total app + src files:',n);if(!process.exitCode)console.log('Source structure checks passed. Install dependencies and run npm run typecheck + npm run build on a machine with registry access.');
