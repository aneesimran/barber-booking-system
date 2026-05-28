import AdminLayoutClient from "@/components/admin/AdminLayoutClient";
import AuthGuard from "@/components/admin/AuthGuard";

export const metadata = {
  title: "Admin Dashboard | Anees Hairdressers",
};

export default function ProtectedAdminLayout({ children }) {
  return (
    <AuthGuard>
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </AuthGuard>
  );
}
