import React from "react";
import type { User, Session } from "@supabase/supabase-js";
import { resolveUsablePersonId } from "@/lib/person-mapping-conflicts";
import { supabase } from "@/lib/supabase";
import type { Household, HouseholdMember } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  household: Household | null;
  membership: HouseholdMember | null;
  usablePersonId: string | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshHousehold: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [household, setHousehold] = React.useState<Household | null>(null);
  const [membership, setMembership] = React.useState<HouseholdMember | null>(null);
  const [usablePersonId, setUsablePersonId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchUserHousehold = React.useCallback(async (userId: string) => {
    const { data: memberData, error: memberError } = await supabase
      .from("household_members")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("status", "active")
      .maybeSingle();

    if (memberError || !memberData) {
      setHousehold(null);
      setMembership(null);
      setUsablePersonId(null);
      return;
    }

    setMembership(memberData as HouseholdMember);

    const [{ data: householdData, error: householdError }, { data: memberRows }] =
      await Promise.all([
        supabase
          .from("households")
          .select("*")
          .eq("id", memberData.household_id)
          .maybeSingle(),
        supabase
          .from("household_members")
          .select("user_id, person_id, status, is_active")
          .eq("household_id", memberData.household_id),
      ]);

    if (householdError || !householdData) {
      setHousehold(null);
      setUsablePersonId(null);
      return;
    }

    setHousehold(householdData as Household);
    setUsablePersonId(resolveUsablePersonId(memberRows ?? [], userId));
  }, []);

  React.useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchUserHousehold(session.user.id);
        } else {
          setHousehold(null);
          setMembership(null);
          setUsablePersonId(null);
        }
        setLoading(false);
      })();
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchUserHousehold(session.user.id);
        } else {
          setUsablePersonId(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserHousehold]);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setHousehold(null);
    setMembership(null);
    setUsablePersonId(null);
  };

  const refreshHousehold = async () => {
    if (user) {
      await fetchUserHousehold(user.id);
    }
  };

  const value = React.useMemo(
    () => ({
      user,
      session,
      household,
      membership,
      usablePersonId,
      loading,
      signUp,
      signIn,
      signOut,
      refreshHousehold,
    }),
    [user, session, household, membership, usablePersonId, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
