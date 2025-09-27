import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminSubscriber = {
  email: string;
  source: string | null;
  confirmed_at: string | null;
  created_at: string | null;
};

export async function loadSubscribers() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("subscribers")
    .select("email, source, confirmed_at, created_at")
    .or("confirmed.eq.true,confirmed_at.not.is.null")
    .eq("status", "active")
    .order("confirmed_at", { ascending: false });
  if (error) throw error;
  const subscribers: AdminSubscriber[] = (data ?? []).map((row) => ({
    email: row.email ?? "",
    source: row.source ?? null,
    confirmed_at: row.confirmed_at ?? row.created_at ?? null,
    created_at: row.created_at ?? null,
  }));
  return subscribers;
}
