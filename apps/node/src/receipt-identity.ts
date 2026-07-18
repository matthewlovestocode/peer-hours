import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { replicationReceiptNodeId } from "@peer-hours/peer-runtime";

/** Persistent Ed25519 material used only to sign non-authoritative retention receipts. */
export interface ReceiptIdentity {
  readonly privateKey: KeyObject;
  readonly publicKey: string;
  readonly nodeId: string;
}

/** Loads one durable node receipt identity, creating it atomically on a fresh persistent volume. */
export async function loadOrCreateReceiptIdentity(path: string): Promise<ReceiptIdentity> {
  await mkdir(dirname(path), { recursive: true });
  try {
    return receiptIdentityFromPem(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const generated = generateKeyPairSync("ed25519");
  const pem = generated.privateKey.export({ format: "pem", type: "pkcs8" }) as string;
  try {
    const file = await open(path, "wx", 0o600);
    await file.writeFile(pem, { encoding: "utf8" });
    await file.close();
    return receiptIdentityFromPrivateKey(generated.privateKey);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return receiptIdentityFromPem(await readFile(path, "utf8"));
  }
}

/** Parses an existing private identity without exposing private material through status or HTTP. */
function receiptIdentityFromPem(pem: string): ReceiptIdentity {
  return receiptIdentityFromPrivateKey(createPrivateKey(pem));
}

/** Derives the exact pinned public identity emitted in bootstrap metadata from private key material. */
function receiptIdentityFromPrivateKey(privateKey: KeyObject): ReceiptIdentity {
  if (privateKey.asymmetricKeyType !== "ed25519") throw new TypeError("Receipt identity must be an Ed25519 private key.");
  const publicDer = createPublicKey(privateKey).export({ format: "der", type: "spki" }) as Buffer;
  const publicKey = publicDer.toString("base64url");
  return Object.freeze({ privateKey, publicKey, nodeId: replicationReceiptNodeId(publicKey) });
}
