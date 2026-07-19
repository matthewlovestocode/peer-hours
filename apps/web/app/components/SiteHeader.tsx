import Link from "next/link";

/** Provides the consistent public-site navigation without coupling pages to their own header markup. */
export function SiteHeader() {
  return <header className="site-header"><Link className="brand" href="/"><span aria-hidden="true">◌</span> Peer Hours</Link><nav aria-label="Main navigation"><Link href="/how-it-works">How it works</Link><Link href="/community-directory">Communities</Link><Link href="/download">Download</Link></nav></header>;
}
