import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

/** Represents public, opt-in information a community may choose to publish through a future signed directory feed. */
type DirectoryCommunity = { name: string; place: string; description: string; fingerprint: string; status: "Invitation available" | "Preparing to welcome members" };

/** Uses clearly marked sample content until a signed, opt-in directory feed is connected. */
const communities: readonly DirectoryCommunity[] = [
  { name: "Oakland Timebank", place: "Oakland, California, US", description: "Neighbors sharing practical help, skills, and care across Oakland.", fingerprint: "98c8…7215", status: "Preparing to welcome members" },
];

/** Renders the public directory as a discovery aid, not a membership authority or source of record truth. */
export default function CommunityDirectoryPage() {
  return <main><SiteHeader /><section className="directory-hero"><p className="eyebrow">Community directory</p><h1>Find a place to share time.</h1><p className="lede">Listings are public only when a community chooses to publish them. A listing helps you find an invitation; it does not approve membership or control your account.</p></section><section className="directory-list" id="directory"><div className="directory-list__intro"><h2>Published communities</h2><p>Directory-feed integration is next. The entry below is an explicitly labeled preview of the final card shape.</p></div>{communities.map((community) => <article className="community-card" key={community.fingerprint}><div><p className="community-card__place">{community.place}</p><h2>{community.name}</h2><p>{community.description}</p></div><div className="community-card__trust"><span>{community.status}</span><code>Genesis {community.fingerprint}</code><button type="button" disabled>Open in desktop app</button></div></article>)}</section><section className="directory-notice"><h2>How directory listings stay honest</h2><p>The website can help you discover a community, but the desktop app verifies its signed genesis record and matching invitation before saving it. Compare the displayed fingerprint with an organizer through a channel you trust.</p><Link className="text-link" href="/community-directory/how-it-works">How invitations work →</Link></section><SiteFooter /></main>;
}
