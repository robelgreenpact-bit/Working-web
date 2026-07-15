import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Service-role client for privileged operations (server-side only)
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Helper: check the requester is an authenticated admin
async function requireAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") return null;

  return user;
}

// GET: list all users
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("public_users")
    .select(
      "id, name, email, role, status, department_id, manager_id, departments(name)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data });
}

// POST: create a new user
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, email, password, role, department_id, manager_id } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  if (!email.endsWith("@greenpactconsulting.com")) {
    return NextResponse.json(
      { error: "Email must be a @greenpactconsulting.com address" },
      { status: 400 },
    );
  }

  const serviceClient = getServiceClient();

  // Step 1: create the auth user
  const { data: authData, error: authError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message || "Failed to create auth user" },
      { status: 500 },
    );
  }

  // Step 2: insert into public_users
  const { error: profileError } = await serviceClient
    .from("public_users")
    .insert({
      id: authData.user.id,
      name,
      email,
      role,
      department_id: department_id || null,
      manager_id: manager_id || null,
      status: "active",
      force_password_change: true,
    });

  if (profileError) {
    // Roll back the auth user if profile insert fails
    await serviceClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
