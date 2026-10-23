'use client';import {useCallback,useEffect,useState} from 'react';
export function useLiveQuery<T>(load:()=>Promise<T>,deps:unknown[]=[]){
 const [data,setData]=useState<T|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 // Consumers supply a stable callback or primitive dependencies.
 const refresh=useCallback(async()=>{try{setError('');setData(await load());}catch(e){setError(e instanceof Error?e.message:'Unable to load data');}finally{setLoading(false);}},deps);
 useEffect(()=>{void refresh();const onFocus=()=>{void refresh()};window.addEventListener('focus',onFocus);
 let timer:ReturnType<typeof setTimeout>|undefined;let last=0;const events=new EventSource('/api/events');
 events.addEventListener('change',()=>{const now=Date.now();if(now-last<300){clearTimeout(timer);timer=setTimeout(()=>void refresh(),300);}else{last=now;void refresh();}});
 return()=>{events.close();window.removeEventListener('focus',onFocus);clearTimeout(timer)};
 },[refresh]);return {data,loading,error,refresh};
}
