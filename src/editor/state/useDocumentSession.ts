import { useEffect, useState, useSyncExternalStore } from "react";
import { documentFileRepository } from "../persistence/documentRepository";
import { recoveryRepository } from "../persistence/recoveryRepository";
import { createDocumentSession } from "./documentSession";

export function useDocumentSession() {
  const [session] = useState(() =>
    createDocumentSession({
      documents: documentFileRepository,
      recovery: recoveryRepository,
    }),
  );
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    void session.hydrate();
    window.addEventListener("pagehide", session.flushRecovery);
    return () => window.removeEventListener("pagehide", session.flushRecovery);
  }, [session]);

  return { ...snapshot, ...session };
}
