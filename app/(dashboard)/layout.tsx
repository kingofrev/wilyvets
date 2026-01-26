import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";
import { Header } from "@/components/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={session.user} />
      <main className="container mx-auto px-4 py-6 max-w-lg">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
