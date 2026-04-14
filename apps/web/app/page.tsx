import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const user = await auth();
  redirect(user ? "/dashboard" : "/login");
}
