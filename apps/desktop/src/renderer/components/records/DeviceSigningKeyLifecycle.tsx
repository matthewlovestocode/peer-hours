import { deviceKeyOccurredLabel, deviceKeyRecoveryGuidance, deviceKeyStateLabel } from "./deviceKeyPresentation.js";

/** A public lifecycle fact supplied by Electron without a private key or key material. */
export type DeviceSigningKeyValue = { keyId: string; state: "active" | "revoked"; occurredAt: string };

/** Lets a member publish protected device-key rotation and revocation records through narrow Electron actions. */
export function DeviceSigningKeyLifecycle({ keys, busy, onActivate, onRevoke }: {
  keys: readonly DeviceSigningKeyValue[];
  busy: boolean;
  onActivate: () => void;
  onRevoke: (keyId: string) => void;
}) {
  const activeKeys = keys.filter((key) => key.state === "active");

  return (
    <section className="device-key-lifecycle" aria-labelledby="device-key-lifecycle-heading">
      <div className="device-key-lifecycle__heading">
        <div>
          <p className="kicker">Device-key recovery</p>
          <h3 id="device-key-lifecycle-heading">Protected device keys</h3>
        </div>
        <button type="button" disabled={busy} onClick={onActivate}>{busy ? "Publishing key…" : "Add recovery device key"}</button>
      </div>
      <p className="muted">{deviceKeyRecoveryGuidance()}</p>
      {keys.length === 0 ? (
        <p className="device-key-lifecycle__empty">No separate device keys are active yet. Your protected root identity remains available on this device.</p>
      ) : (
        <ul className="device-key-lifecycle__list" aria-label="Device signing keys">
          {keys.map((key) => (
            <li key={key.keyId}>
              <div>
                <strong>{deviceKeyStateLabel(key.state)}</strong>
                <code>{key.keyId}</code>
                <small>{deviceKeyOccurredLabel(key.occurredAt)}</small>
              </div>
              {key.state === "active" && <button type="button" className="button--danger" disabled={busy || activeKeys.length === 0} onClick={() => onRevoke(key.keyId)}>Permanently revoke</button>}
            </li>
          ))}
        </ul>
      )}
      <p className="device-key-lifecycle__note">This app publishes and verifies the recovery protocol today. Existing record signing continues to use the protected root identity while device-key signing migration is introduced separately.</p>
    </section>
  );
}
