import { communityScopeLabel, identityPresentation } from "./identityPresentation.js";

/** Defines the identity facts required to render local signing readiness without exposing private key material. */
export type IdentityStatusValue = {
  state: "unavailable" | "not-created" | "ready";
  memberId: string | null;
  communityId: string | null;
  deviceSigningKeys: readonly { keyId: string; state: "active" | "revoked"; occurredAt: string }[];
};

/** Presents local signing readiness, public identity, and community scope with an explicit recovery action. */
export function IdentityStatus({ identity, creating, onCreate }: {
  identity: IdentityStatusValue;
  creating: boolean;
  onCreate: () => void;
}) {
  const presentation = identityPresentation(identity);
  const canCreate = identity.state === "not-created";

  return (
    <section className={`identity-status identity-status--${presentation.tone}`} aria-labelledby="identity-status-heading">
      <div className="identity-status__heading">
        <div>
          <p className="kicker">Your membership</p>
          <h2 id="identity-status-heading">{presentation.heading}</h2>
        </div>
        <span className="identity-status__tone" role="status">{presentation.tone === "ready" ? "Ready" : presentation.tone === "attention" ? "Action needed" : "Unavailable"}</span>
      </div>
      <p className="muted">{presentation.detail}</p>
      {identity.state === "ready" && (
        <dl className="identity-status__identifiers">
          <div>
            <dt>Member ID</dt>
            <dd><code>{identity.memberId ?? "Not reported"}</code></dd>
            <small>Your public identifier for community activity.</small>
          </div>
          <div>
            <dt>Community</dt>
            <dd><code>{identity.communityId ?? "Not reported"}</code></dd>
            <small>{communityScopeLabel(identity.communityId)}</small>
          </div>
        </dl>
      )}
      {canCreate && <button type="button" disabled={creating} onClick={onCreate}>{creating ? "Setting up your membership…" : "Set up my membership"}</button>}
      {identity.state === "unavailable" && <p className="error-message" role="alert">Unlock or enable secure operating-system storage, then try again. Your existing activity has not changed.</p>}
    </section>
  );
}
