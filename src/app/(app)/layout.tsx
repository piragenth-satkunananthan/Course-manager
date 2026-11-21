import { Banners } from "@/components/app/banners";
import { NavBottom, NavSidebar } from "@/components/app/nav";
import { getBanners } from "@/server/data/health";
import { requireStudentId } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const banners = await getBanners(await requireStudentId());
  return (
    <>
      <NavSidebar />
      <main className="mx-auto max-w-[1200px] px-4 pt-4 pb-24 md:ml-[72px] md:px-8 md:pt-8 md:pb-8 lg:ml-60">
        <Banners banners={banners} />
        {children}
      </main>
      <NavBottom />
    </>
  );
}
