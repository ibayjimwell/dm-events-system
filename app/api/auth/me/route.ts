import {route,ok} from '@/lib/http';import {actor} from '@/lib/auth';
export const GET=route(async()=>ok({user:await actor()}));
