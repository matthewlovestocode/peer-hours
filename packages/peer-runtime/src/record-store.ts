/** A JSON value that can be persisted without custom serialization behavior. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

type HypercoreLike = {
  key: Uint8Array;
  length: number;
  writable: boolean;
  ready(): Promise<void>;
  append(value: unknown): Promise<void>;
  get(index: number): Promise<unknown>;
};

type CorestoreLike = {
  get(options: { name?: string; key?: Uint8Array; valueEncoding: "json" }): HypercoreLike;
};

/** Creates a recursively frozen JSON clone so callers cannot mutate a read record. */
function freezeJson<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freezeJson(item);
  }
  return Object.freeze(value);
}

/** Verifies that a value is a finite, recursively JSON-serializable value. */
function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(isJsonValue);
}

/** Validates, clones, and freezes a generic JSON record before it enters or leaves a core. */
function normalizeRecord<TRecord extends JsonValue>(value: unknown): TRecord {
  if (!isJsonValue(value)) throw new TypeError("A record store accepts only finite JSON values");
  return freezeJson(JSON.parse(JSON.stringify(value)) as TRecord);
}

/**
 * A generic append-only JSON record store backed by one named Hypercore.
 *
 * It owns neither the supplied Corestore nor replication transport. Replicating
 * the surrounding Corestore makes the same immutable sequence available to a
 * second RecordStore opened with this instance's public key.
 */
export class HypercoreRecordStore<TRecord extends JsonValue = JsonValue> {
  private constructor(private readonly core: HypercoreLike) {}

  /** Opens a named local core, or opens an existing core by its hexadecimal public key. */
  static async open<TRecord extends JsonValue = JsonValue>(
    store: CorestoreLike,
    name: string,
    publicKey?: string,
  ): Promise<HypercoreRecordStore<TRecord>> {
    if (name.trim() === "") throw new TypeError("A record store name is required");
    const core = publicKey
      ? store.get({ key: Buffer.from(publicKey, "hex"), valueEncoding: "json" })
      : store.get({ name, valueEncoding: "json" });
    await core.ready();
    return new HypercoreRecordStore<TRecord>(core);
  }

  /** Returns this core's stable hexadecimal public key for remote readers. */
  get publicKey(): string {
    return Buffer.from(this.core.key).toString("hex");
  }

  /** Returns the number of immutable records currently available in the core. */
  get length(): number {
    return this.core.length;
  }

  /** Reports whether this store owns the private key required to append to its core. */
  get writable(): boolean {
    return this.core.writable;
  }

  /** Appends one validated immutable JSON record and returns its zero-based sequence index. */
  async append(record: TRecord): Promise<number> {
    if (!this.writable) throw new Error("This record core is read-only.");
    const normalized = normalizeRecord<TRecord>(record);
    const index = this.core.length;
    await this.core.append(normalized);
    return index;
  }

  /** Reads one immutable JSON record by zero-based sequence index, or null when unavailable. */
  async read(index: number): Promise<TRecord | null> {
    if (!Number.isInteger(index) || index < 0) throw new RangeError("A record index must be a non-negative integer");
    if (index >= this.core.length) return null;
    return normalizeRecord<TRecord>(await this.core.get(index));
  }

  /** Reads the complete immutable record sequence currently available in this core. */
  async readAll(): Promise<readonly TRecord[]> {
    const records: TRecord[] = [];
    for (let index = 0; index < this.core.length; index += 1) {
      const record = await this.read(index);
      if (record) records.push(record);
    }
    return Object.freeze(records);
  }
}
