'use client';
import { InlineSkeleton } from '@/components/ui/LoadingSkeleton';
import { BookingSuccessCard } from '@/components/ui/BookingFeedback';
import { bookingStyles as bookingStyles } from '@/components/ui/BookingSurface';

import { uploadImage } from '@/api-client/uploadImage';
import AvailableDatePicker from '@/components/ui/AvailableDatePicker';
import { assertAvailableDate } from '@/api-client/bookingAvailability';
import CountryPhoneInput from '@/components/ui/CountryPhoneInput';
import { normalizePhoneNumber, type PhoneCountry } from '@/lib/validators';

import {useEffect,useState,type ChangeEvent,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeft,ArrowRight,CheckCircle2,UploadCloud} from 'lucide-react';
import {api,json} from '@/api-client/http';
import {PageTitle} from '@/components/ui/Blocks';

type Values={contactName:string;contactEmail:string;contactPhone:string;eventType:string;eventDate:string;guestCount:string;venue:string;estimatedBudget:string;packageId:string;preferredTheme:string;colorPalette:string;specialRequests:string;inspirationAssetId:string};
type Package={id:string;name:string};
const initial:Values={contactName:'',contactEmail:'',contactPhone:'',eventType:'Wedding',eventDate:'',guestCount:'',venue:'',estimatedBudget:'',packageId:'',preferredTheme:'',colorPalette:'',specialRequests:'',inspirationAssetId:''};
const field='block mb-1.5 text-sm font-semibold text-[#122c44]';
const input='w-full min-w-0 rounded-lg border border-[#cbd9e6] bg-white px-3 py-3 text-sm text-[#122c44] outline-none transition focus:border-[#0b4d98] focus:ring-2 focus:ring-[#0b4d98]/15';

export default function WalkInBooking({role}:{role:'ADMIN'|'COORDINATOR'}){
 const router=useRouter();const [country,setCountry]=useState<PhoneCountry>('PH');const [form,setForm]=useState<Values>(initial);const [step,setStep]=useState<1|2>(1);
 const [packages,setPackages]=useState<Package[]>([]);const [packagesLoading,setPackagesLoading]=useState(true);const [consent,setConsent]=useState(false);
 const [photo,setPhoto]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [completed,setCompleted]=useState<{id:string;reference:string}|null>(null);
 const base=role==='ADMIN'?'/admin/bookings':'/coordinator/requests';
 const set=(key:keyof Values,value:string)=>setForm(old=>({...old,[key]:value}));
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
 useEffect(()=>{void api<{packages:Package[]}>('/api/packages').then(x=>setPackages(x.packages)).catch(()=>{}).finally(()=>setPackagesLoading(false));},[]);
 async function next(e:FormEvent){
  e.preventDefault();setError('');
  if(!form.eventDate||form.eventDate<today){setError('Select today or a future available date.');return;}
  if(!normalizePhoneNumber(form.contactPhone,country)){setError('Enter a valid contact number for the selected country.');return;}
  setBusy(true);
  try{await assertAvailableDate(form.eventDate);setStep(2);window.scrollTo({top:0,behavior:'smooth'});}
  catch(error){setError(error instanceof Error?error.message:'Availability check failed.');}
  finally{setBusy(false);}
 }
 async function upload(e:ChangeEvent<HTMLInputElement>){const image=e.target.files?.[0];if(!image)return;
  setError('');if(image.size<=0||image.size>10*1024*1024){setError('Choose an image of 10 MB or less.');return;}
  if(!['image/jpeg','image/png','image/webp'].includes(image.type)){setError('Only JPG, PNG or WebP images are allowed.');return;}
  setBusy(true);try{const asset=await uploadImage(image,'INSPIRATION');set('inspirationAssetId',asset.id);setPhoto(asset.name);
  }catch(e){setError(e instanceof Error?e.message:'Image upload failed');}finally{setBusy(false);}
 }
 async function submit(e:FormEvent){e.preventDefault();setError('');if(!consent){setError('Record the customer’s privacy acknowledgment before submitting.');return;}
  setBusy(true);try{await assertAvailableDate(form.eventDate);const {booking}=await api<{booking:{id:string;reference:string}}>('/api/bookings/walk-in',json('POST',{...form,contactPhone:normalizePhoneNumber(form.contactPhone,country),guestCount:Number(form.guestCount),packageId:form.packageId||null,inspirationAssetId:form.inspirationAssetId||null,consent:true}));setCompleted({id:booking.id,reference:booking.reference});
  }catch(e){setError(e instanceof Error?e.message:'Could not create a booking');}finally{setBusy(false);}
 }
 const textInput=(label:string,key:keyof Values,options?:{type?:string;placeholder?:string;required?:boolean;min?:string})=><label className="block min-w-0"><span className={field}>{label}</span><input className={input} required={options?.required!==false} type={options?.type||'text'} min={options?.min} value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={options?.placeholder}/></label>;
 if(completed)return <main className={bookingStyles.page}><div className={`${bookingStyles.shell} py-4 sm:py-9`}>
 <BookingSuccessCard reference={completed.reference} title="Walk-in inquiry recorded" message="The customer's inquiry is saved as Tentative. They do not have a Client portal account, so contact them using the details they provided. Staff must review the preferred date before confirming." viewHref={`${base}/${completed.id}`} onNew={()=>{setCompleted(null);setForm(initial);setCountry('PH');setConsent(false);setPhoto('');setStep(1);}} />
 </div></main>;
 return <main className="page-wrap page-space min-w-0"><PageTitle title="Create walk-in booking" subtitle="Authorized staff can capture an inquiry for a client without creating a website account."/>
 <div className="mb-6 flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#e4eef8] px-4 py-2 text-sm font-semibold text-[#0b4d98]">Step {step} of 2</span><span className="text-sm text-[#748498]">{step===1?'Event and customer information':'Preferences and privacy consent'}</span></div>
 {error&&<p className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
 {step===1?<form onSubmit={next} className="space-y-6"><div className="grid grid-cols-1 gap-5 rounded-xl border border-[#dae4ed] bg-white p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
 {textInput('Full name','contactName',{placeholder:'Client’s full name'})}{textInput('Email address (optional)','contactEmail',{type:'email',placeholder:'name@example.com',required:false})}<CountryPhoneInput id="walkin-phone" label="Contact number" country={country} number={form.contactPhone} onCountryChange={setCountry} onNumberChange={value=>set('contactPhone',value)} hint="Stored and sent internationally (e.g. +639123456789)"/>
 <label className="block min-w-0"><span className={field}>Event type</span><select className={input} value={form.eventType} onChange={e=>set('eventType',e.target.value)}>{['Wedding','Birthday','Debut','Corporate Event','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
 <AvailableDatePicker id="walkin-event-date" label="Preferred date" value={form.eventDate} onChange={value=>{set('eventDate',value);setError('');}} />{textInput('Guest count','guestCount',{type:'number',min:'1'})}
 {textInput('Venue / location','venue')}{textInput('Estimated budget (PHP)','estimatedBudget')}
 <label className="block min-w-0"><span className={field}>Preferred package</span><select className={input} value={form.packageId} onChange={e=>set('packageId',e.target.value)}><option value="">Not decided</option>{packages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{packagesLoading&&<InlineSkeleton rows={1} label="Loading package options" />}</label>
 </div><p className="text-sm text-[#748498]">The request remains tentative until authorized staff review availability and approve the booking.</p><div className="flex justify-end"><button type="submit" disabled={busy} className="btn w-full sm:w-auto">{busy?'Checking date…':'Continue to preferences'} <ArrowRight size={17}/></button></div></form>:
 <form onSubmit={submit} className="space-y-6"><div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
 <section className="min-w-0 rounded-xl border border-[#dae4ed] bg-white p-4 sm:p-6"><h3 className="mb-5 text-xl font-semibold">Inspiration image</h3><label className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-[#b9cfdf] bg-[#f1f6fa] p-5 text-center text-sm text-[#0b4d98]"><UploadCloud size={34}/>{photo||'Choose a JPG, PNG or WebP image (max 10 MB)'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label>{form.inspirationAssetId&&<img src={`/api/assets/${form.inspirationAssetId}`} alt="Inspiration preview" className="mt-4 max-h-48 w-full rounded-lg object-contain"/>}</section>
 <section className="min-w-0 space-y-4 rounded-xl border border-[#dae4ed] bg-white p-4 sm:p-6"><h3 className="mb-5 text-xl font-semibold">Styling preferences</h3>{textInput('Preferred theme','preferredTheme',{required:false})}{textInput('Color palette','colorPalette',{required:false})}<label className="block"><span className={field}>Additional requests</span><textarea className={input} rows={4} value={form.specialRequests} onChange={e=>set('specialRequests',e.target.value)}/></label></section></div>
 <section className="rounded-xl border border-[#dae4ed] bg-white p-4 sm:p-6"><h3 className="mb-3 text-xl font-semibold">Review and consent</h3><p className="break-words text-sm text-[#122c44]">{form.contactName} • {form.eventType} • {form.eventDate} • {form.venue}</p><p className="mt-2 text-sm text-[#748498]">Client email: {form.contactEmail}. This request is not a confirmed booking or a payment.</p><label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 text-[#122c44]"><input className="mt-1 size-5 shrink-0 accent-[#0b4d98]" type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I have explained the <Link href="/privacy" target="_blank" className="text-[#0b4d98] underline">Privacy Policy</Link> to the walk-in customer, obtained their acknowledgment, and recorded it here.</span></label></section>
 <div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><button type="button" className="btn btn-ghost" onClick={()=>setStep(1)}><ArrowLeft size={17}/> Back</button><button type="submit" className="btn" disabled={busy||!consent}>{busy?'Saving…':'Submit walk-in request'} <CheckCircle2 size={17}/></button></div></form>}
 </main>;
}
