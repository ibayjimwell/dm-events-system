import {db} from '@/db';import {backupLogs,systemSettings} from '@/db/schema';import {eq,lt} from 'drizzle-orm';import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';import {execFileSync} from 'node:child_process';import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';import {HttpError} from './http';
const configured=()=>{
 const key=process.env.BACKUP_ENCRYPTION_KEY||'';
 if(!/^[a-f0-9]{64}$/i.test(key)||!process.env.BACKUP_S3_BUCKET||!process.env.BACKUP_S3_ACCESS_KEY_ID||!process.env.BACKUP_S3_SECRET_ACCESS_KEY)throw new HttpError(503,'Encrypted offsite backup destination is not configured');
 return Buffer.from(key,'hex');
};
const s3=()=>new S3Client({region:process.env.BACKUP_S3_REGION||'auto',endpoint:process.env.BACKUP_S3_ENDPOINT||undefined,forcePathStyle:!!process.env.BACKUP_S3_ENDPOINT,credentials:{accessKeyId:process.env.BACKUP_S3_ACCESS_KEY_ID!,secretAccessKey:process.env.BACKUP_S3_SECRET_ACCESS_KEY!}});
function pgEnv(){const url=new URL(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL||'');if(!url.hostname)throw new HttpError(503,'Database backup connection missing');return {env:{...process.env,PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'require'},args:['-h',url.hostname,'-p',url.port||'5432','-U',decodeURIComponent(url.username),'-d',url.pathname.replace(/^\//,''),'--no-owner','--no-privileges']};}
export async function createBackup(performedBy:string|null=null){
 const key=configured();const [log]=await db.insert(backupLogs).values({performedBy,status:'RUNNING'}).returning();
 try{
  const pg=pgEnv();const dump=execFileSync('pg_dump',[...pg.args,'--format=custom','--schema=public','--schema=drizzle'],{env:pg.env,maxBuffer:100*1024*1024,timeout:5*60*1000});
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(dump),cipher.final()]);
  const blob=Buffer.concat([Buffer.from('DME1'),iv,cipher.getAuthTag(),data]);
  const storageKey=`dm-events/${new Date().toISOString().slice(0,10)}/${log.id}.dump.aes256gcm`;
  await s3().send(new PutObjectCommand({Bucket:process.env.BACKUP_S3_BUCKET!,Key:storageKey,Body:blob,ContentType:'application/octet-stream',Metadata:{format:'pg-custom-encrypted-aes256gcm'}}));
  await db.update(backupLogs).set({status:'SUCCESS',storageKey,sizeBytes:blob.length}).where(eq(backupLogs.id,log.id));
  const [settings]=await db.select().from(systemSettings).where(eq(systemSettings.id,'main'));
  if(settings){const old=await db.select().from(backupLogs).where(lt(backupLogs.createdAt,new Date(Date.now()-settings.retentionDays*86400000)));for(const b of old){if(b.storageKey){await s3().send(new DeleteObjectCommand({Bucket:process.env.BACKUP_S3_BUCKET!,Key:b.storageKey}));}await db.delete(backupLogs).where(eq(backupLogs.id,b.id));}}
  return {id:log.id,status:'SUCCESS',sizeBytes:blob.length};
 }catch(e){await db.update(backupLogs).set({status:'FAILED',error:String(e).slice(0,500)}).where(eq(backupLogs.id,log.id));throw e;}
}
export async function decryptBackup(storageKey:string){const key=configured();const result=await s3().send(new GetObjectCommand({Bucket:process.env.BACKUP_S3_BUCKET!,Key:storageKey}));if(!result.Body)throw new Error('Backup object empty');const raw=Buffer.from(await result.Body.transformToByteArray());if(raw.subarray(0,4).toString()!=='DME1')throw new Error('Unexpected backup format');const decipher=createDecipheriv('aes-256-gcm',key,raw.subarray(4,16));decipher.setAuthTag(raw.subarray(16,32));return Buffer.concat([decipher.update(raw.subarray(32)),decipher.final()]);}
