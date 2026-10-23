import {ReactNode} from 'react';import Link from 'next/link';
export function Panel({children,title,className=''}:{children:ReactNode;title?:string;className?:string}){return <section className={`panel ${className}`}>{title&&<h3>{title}</h3>}{children}</section>}
export function Stat({label,value,detail}:{label:string;value:string|number;detail?:string}){return <div className="stat"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{detail&&<div className="stat-detail">{detail}</div>}</div>}
export function Status({value}:{value:string}){return <span className={`status-pill status-${value.toLowerCase()}`}>{value}</span>}
export function Field({label,children}:{label:string;children:ReactNode}){return <div className="field"><label>{label}</label>{children}</div>}
export function Empty({title='Nothing here yet',description}:{title?:string;description?:string}){return <div className="empty"><h3>{title}</h3>{description&&<p>{description}</p>}</div>}
export function PageTitle({title,subtitle}:{title:string;subtitle?:string}){return <div className="page-title"><h2>{title}</h2>{subtitle&&<p className="hint" style={{marginTop:11}}>{subtitle}</p>}</div>}
export function ActionLink({href,children,secondary=false}:{href:string;children:ReactNode;secondary?:boolean}){return <Link href={href} className={`btn ${secondary?'btn-ghost':''}`}>{children}</Link>}
export const money=(value:string|number|null|undefined)=>'₱ '+Number(value||0).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:2});
export const niceDate=(s:string|Date|null|undefined)=>s?new Date(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)?s+'T12:00:00':s).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}):'—';
