import AdminApp from "@/components/AdminApp";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/app");
  return <AdminApp />;
}
