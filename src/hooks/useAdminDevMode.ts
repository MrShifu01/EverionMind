import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { getAdminFlags, setAdminFlag as persistFlag } from "../lib/featureFlags";

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

export function useAdminDevMode() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminFlags, setAdminFlagsState] = useState(getAdminFlags);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      setIsAdmin(!!ADMIN_EMAIL && email === ADMIN_EMAIL);
    });
  }, []);

  // Stay in sync when the settings panel updates a flag
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "openbrain_admin_flags") setAdminFlagsState(getAdminFlags());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setAdminFlag = (key: string, val: boolean) => {
    persistFlag(key, val);
    setAdminFlagsState(getAdminFlags());
    window.dispatchEvent(new StorageEvent("storage", { key: "openbrain_admin_flags" }));
  };

  // Flags only take effect when the user is actually an admin
  return { isAdmin, adminFlags: isAdmin ? adminFlags : {}, setAdminFlag };
}
