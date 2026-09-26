import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "ops_manager" | "sales_rep" | "finance_controller";

const ROLES: readonly Role[] = ["ops_manager", "sales_rep", "finance_controller"];

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// TODO(data): once migration 0002 lands, replace this with a `profiles` table
// join (id = auth.users.id) instead of reading user_metadata.
function roleOf(user: { user_metadata?: Record<string, unknown> }): Role {
  const claimed = user.user_metadata?.role;
  return isRole(claimed) ? claimed : "ops_manager";
}

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function getSession() {
  const user = await getUser();
  if (!user) return null;
  return { user, role: roleOf(user) };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
