import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("public_users")
    .select("role, force_password_change")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  if (profile.force_password_change) {
    redirect("/change-password");
  }

  switch (profile.role) {
    case "admin":
      redirect("/admin");
    case "manager":
      redirect("/manager");
    case "finance":
      redirect("/finance");
    case "accountant":
      redirect("/accountant");
    case "worker":
      redirect("/worker");
    default:
      redirect("/login");
  }
}
