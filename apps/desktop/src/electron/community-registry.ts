import type { CommunityGenesis, CommunityInvitation } from "@peer-hours/peer-runtime";

/** Locally trusted community details retained by this device after a verified create or join action. */
export type SavedCommunity = { readonly genesis: CommunityGenesis; readonly invitation: CommunityInvitation; readonly savedAt: string };

/** Defines the small persistence boundary for an app-owned, locally trusted community registry. */
export type CommunityRegistryStore = { readonly read: () => Promise<readonly SavedCommunity[]>; readonly write: (communities: readonly SavedCommunity[]) => Promise<void> };

/** Maintains locally trusted community choices without creating a network-wide authority or registry. */
export class CommunityRegistry {
  /** Creates a registry over a filesystem adapter owned by Electron main. */
  constructor(private readonly store: CommunityRegistryStore) {}

  /** Lists communities this device has previously verified, newest selection data first. */
  async list(): Promise<readonly SavedCommunity[]> { return Object.freeze([...(await this.store.read())]); }

  /** Saves a verified community once, replacing only an identical immutable community id. */
  async remember(genesis: CommunityGenesis, invitation: CommunityInvitation): Promise<void> {
    const current = await this.store.read();
    const next = [...current.filter((community) => community.genesis.communityId !== genesis.communityId), { genesis, invitation, savedAt: new Date().toISOString() }];
    await this.store.write(next);
  }
}
