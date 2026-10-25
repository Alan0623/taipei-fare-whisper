import { useEffect, useState } from "react";
import { Navigate, Outlet, useOutletContext } from "react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthContext = { user: User };

// Client-side guard for authenticated routes: verifies the user with Supabase,
// redirects to /signin when signed out, and re-checks on auth state changes.
export function RequireAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (active) setUser(data.user);
    };
    check();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setUser(null);
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") check();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (user === undefined) return null;
  if (!user) return <Navigate to="/signin" replace />;
  return <Outlet context={{ user } satisfies AuthContext} />;
}

export function useAuth() {
  return useOutletContext<AuthContext>();
}
