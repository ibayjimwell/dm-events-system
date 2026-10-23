import { Resend } from 'resend';
import { HttpError } from './http';
export async function sendMail(to:string,subject:string,body:string){
 const key=process.env.RESEND_API_KEY;const from=process.env.MAIL_FROM;
 if(!key || !from)throw new HttpError(503,'Email delivery is not configured. Contact your administrator.');
 const {error}=await new Resend(key).emails.send({from,to,subject,text:body});
 if(error)throw new HttpError(503,'Email delivery unavailable. Please try again later.');
}
