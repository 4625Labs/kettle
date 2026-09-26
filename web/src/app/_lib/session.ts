import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profileRoleSchema, type ProfileRole } from "@/lib/contracts";

export type Role = ProfileRole;

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// A user with no `profiles` row (or an unrecognized role) is treated as
// unauthorized, never defaulted to a role — profiles is the single source of
// truth for who can approve what.
export const getSession = cache(async () => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const parsed = profileRoleSchema.safeParse(profile?.role);
  if (!parsed.success) return null;

  return { user, role: parsed.data };
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
