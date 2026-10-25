import {pagePermission} from '@/lib/access';
import {Suspense} from 'react';import MessagesPanel from '@/components/shared/MessagesPanel';export default async function Page(){await pagePermission('messages.own');return <Suspense><MessagesPanel role="CLIENT"/></Suspense>}
