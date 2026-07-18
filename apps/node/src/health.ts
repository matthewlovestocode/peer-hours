export type NodeHealth = {
  status: "ok";
  core: string;
  length: number;
};

export function createHealthPayload(core: { key: Buffer; length: number }): NodeHealth {
  return {
    status: "ok",
    core: core.key.toString("hex"),
    length: core.length,
  };
}
