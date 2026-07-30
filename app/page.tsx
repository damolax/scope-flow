import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? "/app" : "/login");
}
