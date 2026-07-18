import { communityScopeLabel, identityPresentation } from "./identityPresentation.js";
import { DeviceSigningKeyLifecycle, type DeviceSigningKeyValue } from "./DeviceSigningKeyLifecycle.js";

/** Defines the identity facts required to render local signing readiness without exposing private key material. */
export type IdentityStatusValue = {
  state: "unavailable" | "not-created" | "ready";
  memberId: string | null;
  communityId: string | null;
  deviceSigningKeys: readonly DeviceSigningKeyValue[];
};

/** Presents local signing readiness, public identity, and community scope with an explicit recovery action. */
export function IdentityStatus({ identity, creating, changingDeviceKey, onCreate, onActivateDeviceKey, onRevokeDeviceKey }: {
  identity: IdentityStatusValue;
  creating: boolean;
  changingDeviceKey: boolean;
  onCreate: () => void;
  onActivateDeviceKey: () => void;
  onRevokeDeviceKey: (keyId: string) => void;
}) {
  const presentation = identityPresentation(identity);
  const canCreate = identity.state === "not-created";

  return (
    <section className={`identity-status identity-status--${presentation.tone}`} aria-labelledby="identity-status-heading">
      <div className="identity-status__heading">
        <div>
          <p className="kicker">Local signing identity</p>
          <h2 id="identity-status-heading">{presentation.heading}</h2>
        </div>
        <span className="identity-status__tone" role="status">{presentation.tone === "ready" ? "Ready" : presentation.tone === "attention" ? "Action needed" : "Unavailable"}</span>
      </div>
      <p className="muted">{presentation.detail}</p>
      {identity.state === "ready" && (
        <dl className="identity-status__identifiers">
          <div>
            <dt>Member identity</dt>
            <dd><code>{identity.memberId ?? "Not reported"}</code></dd>
            <small>Public identifier for records signed by this member.</small>
          </div>
          <div>
            <dt>Community scope</dt>
            <dd><code>{identity.communityId ?? "Not reported"}</code></dd>
            <small>{communityScopeLabel(identity.communityId)}</small>
          </div>
        </dl>
      )}
      {identity.state === "ready" && <DeviceSigningKeyLifecycle keys={identity.deviceSigningKeys} busy={changingDeviceKey} onActivate={onActivateDeviceKey} onRevoke={onRevokeDeviceKey} />}
      {canCreate && <button type="button" disabled={creating} onClick={onCreate}>{creating ? "Creating local identity…" : "Create identity and announce member feed"}</button>}
      {identity.state === "unavailable" && <p className="error-message" role="alert">Unlock or enable secure operating-system storage, then refresh this workspace. Your existing raw history is unchanged.</p>}
    </section>
  );
}
