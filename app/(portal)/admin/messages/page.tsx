import {pagePermission} from '@/lib/access';
import {Suspense} from 'react';import MessagesPanel from '@/components/shared/MessagesPanel';export default async function Page(){await pagePermission('messages.staff');return <Suspense><MessagesPanel role="ADMIN"/></Suspense>}
