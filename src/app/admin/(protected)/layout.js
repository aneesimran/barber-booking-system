import AdminSidebar from "@/components/admin/AdminSidebar";
import AuthGuard from "@/components/admin/AuthGuard";

export const metadata = {
  title: "Admin Dashboard | Anees Hairdressers",
};

export default function ProtectedAdminLayout({ children }) {
  return (
    <AuthGuard>
      <div className="flex h-screen bg-[#0a0a0a] overflow-hidden text-white font-sans">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
