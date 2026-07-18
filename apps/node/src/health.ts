export type NodeHealth = {
  status: "ok" | "starting" | "error";
  core: string;
  length: number;
};

/** Maps the runtime's point-in-time state to a lightweight, non-mutating HTTP health payload. */
export function createHealthPayload(runtime: { state: NodeHealth["status"]; core: string; length: number }): NodeHealth {
  return {
    status: runtime.state,
    core: runtime.core,
    length: runtime.length,
  };
}
