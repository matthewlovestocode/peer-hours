import { useEffect, useState } from "react";
import { IdentityStatus, type IdentityStatusValue } from "../components/records/IdentityStatus.js";
import { WorkspaceHeader } from "../components/WorkspaceHeader.js";

/** Welcomes members, keeps membership setup separate from exchange activity, and directs ready members to participate. */
export function HomePage({ onOpenActivity }: { onOpenActivity: () => void }) {
  const [identity, setIdentity] = useState<IdentityStatusValue | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void window.peerHours.getMemberIdentityStatus().then(setIdentity).catch(() => setIdentity({ state: "unavailable", memberId: null, communityId: null, deviceSigningKeys: [] }));
  }, []);

  /** Creates a membership identity through Electron, then updates the member-facing setup state. */
  const createMembership = async () => {
    setCreating(true);
    try {
      setIdentity(await window.peerHours.createAndAnnounceMemberIdentity());
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="home-page">
      <WorkspaceHeader eyebrow="Peer Hours" title="Share time. Receive help." description="Peer Hours helps your community recognize the time people give and receive. Set up your membership to share an offer, ask for help, or keep track of an exchange." variant="hero" />
      {identity ? <IdentityStatus identity={identity} creating={creating} onCreate={() => void createMembership()} /> : <p className="empty-state" role="status">Preparing your membership…</p>}
      <div className="home-page__actions">
        {identity?.state === "ready" && <button type="button" onClick={onOpenActivity}>Open my activity</button>}
        <p>Your activity stays with you and syncs directly with your community when peers are available.</p>
      </div>
    </section>
  );
}
