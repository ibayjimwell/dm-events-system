export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";
import { actor } from "@/lib/auth";
import { permissionSet } from "@/lib/access";
import SiteNav from "@/components/shared/SiteNav";
import Footer from "@/components/shared/Footer";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await actor();
  if (!user) redirect("/login");
  const permissions = await permissionSet(user);
  // The corresponding page and API still verify individual permissions.
  const adminModules = [
    "dashboard.admin",
    "analytics.view",
    "bookings.view.all",
    "bookings.create.walkin",
    "packages.manage",
    "content.manage",
    "settings.manage",
    "backups.manage",
    "users.manage",
  ] as const;
  if (!adminModules.some((p) => permissions.has(p)))
    redirect(user.role === "CLIENT" ? "/client" : "/coordinator");
  return (
    <>
      <SiteNav role={user.role} permissions={[...permissions]} />
      {children}
      <Footer label="ADMIN MODULE" />
    </>
  );
}
