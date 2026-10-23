import SiteNav from '@/components/shared/SiteNav';import Footer from '@/components/shared/Footer';import {actor} from '@/lib/auth';
export default async function PublicLayout({children}:{children:React.ReactNode}){const user=await actor();return <><SiteNav role="PUBLIC" signedIn={!!user}/>{children}<Footer/></>}
