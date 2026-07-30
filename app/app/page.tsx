import MainApp from "@/components/MainApp";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function WorkspacePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <MainApp />;
}
