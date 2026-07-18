import type { ResolvedMemberState } from "./types.js";

/** Represents the three independently read values that must advance together in the records workspace. */
export type RecordsWorkspaceSnapshot = {
  records: readonly unknown[];
  identity: { state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null };
  resolved: ResolvedMemberState;
};

/** Defines the narrow main-process reads required to recover a consistent records workspace snapshot. */
export type RecordsWorkspaceReader = {
  getMemberRecords: () => Promise<readonly unknown[]>;
  getMemberIdentityStatus: () => Promise<RecordsWorkspaceSnapshot["identity"]>;
  getResolvedMemberState: () => Promise<ResolvedMemberState>;
};

/** Reads raw history, identity state, and local verification as one atomic renderer snapshot. */
export async function readRecordsWorkspace(reader: RecordsWorkspaceReader): Promise<RecordsWorkspaceSnapshot> {
  const [records, identity, resolved] = await Promise.all([
    reader.getMemberRecords(),
    reader.getMemberIdentityStatus(),
    reader.getResolvedMemberState(),
  ]);
  return { records, identity, resolved };
}

/** Converts unknown IPC failures into a safe, actionable local-workspace message. */
export function recordsWorkspaceErrorMessage(reason: unknown): string {
  return reason instanceof Error && reason.message
    ? reason.message
    : "The local member feed could not be read. Check the app's local storage and try again.";
}
