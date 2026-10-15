import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/lib/schemas/action-plan";
import * as auth from "../services/auth-api";
import { UNAUTHENTICATED_EVENT } from "../services/api-client";

type SessionState =
  | { status: "loading" }
  | { status: "signed_out"; error: string | null }
  | { status: "signed_in"; user: SessionUser };

export function useSession() {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let isActive = true;

    auth.fetchCurrentUser().then((result) => {
      if (!isActive) {
        return;
      }

      if (result.ok && result.data) {
        setState({ status: "signed_in", user: result.data });
      } else {
        setState({
          status: "signed_out",
          error: result.ok ? null : result.message,
        });
      }
    });

    // Any API call that comes back 401 (for example, an expired session).
    function handleUnauthenticated() {
      setState({ status: "signed_out", error: null });
    }

    window.addEventListener(UNAUTHENTICATED_EVENT, handleUnauthenticated);

    return () => {
      isActive = false;
      window.removeEventListener(UNAUTHENTICATED_EVENT, handleUnauthenticated);
    };
  }, []);

  const signIn = useCallback(async (userId: string) => {
    const result = await auth.signIn(userId);

    if (result.ok) {
      setState({ status: "signed_in", user: result.data });
    } else {
      setState({ status: "signed_out", error: result.message });
    }
  }, []);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setState({ status: "signed_out", error: null });
  }, []);

  return { state, signIn, signOut };
}
