import {route,ok} from '@/lib/http';
export const GET=route(async()=>ok({status:'ok',service:'DM Events'}));
