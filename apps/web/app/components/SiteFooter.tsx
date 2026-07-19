import Link from "next/link";

/** Provides concise public-site navigation and states the project's operating commitments. */
export function SiteFooter() {
  return <footer><span>Peer Hours</span><span>Federated · local-first · open source · not-for-profit</span><Link href="/open-source">Open source</Link></footer>;
}
