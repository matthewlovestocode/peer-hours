import { useCallback, useEffect, useRef, useState } from "react";
import { readRecordsWorkspace, recordsWorkspaceErrorMessage, type RecordsWorkspaceSnapshot } from "./recordsWorkspace.js";
import type { RecordsWorkspacePhase } from "./RecordsWorkspaceStatus.js";

/** Reads a consistent activity snapshot and retains the last usable result while a refresh is underway. */
export function useRecordsWorkspace() {
  const [snapshot, setSnapshot] = useState<RecordsWorkspaceSnapshot | null>(null);
  const [phase, setPhase] = useState<RecordsWorkspacePhase>("loading");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  /** Refreshes all activity views from one consistent local snapshot. */
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setPhase((current) => current === "loading" ? "loading" : "refreshing");
    setRefreshError(null);
    try {
      const nextSnapshot = await readRecordsWorkspace(window.peerHours);
      if (version !== requestVersion.current) return;
      setSnapshot(nextSnapshot);
      setPhase("ready");
    } catch (reason) {
      if (version !== requestVersion.current) return;
      setRefreshError(recordsWorkspaceErrorMessage(reason));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  return { snapshot, phase, refreshError, refresh };
}
