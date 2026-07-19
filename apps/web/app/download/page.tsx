import { DownloadOptions } from "../components/DownloadOptions";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

/** Presents an honest release surface before distributable desktop builds are published. */
export default function DownloadPage() {
  return <main><SiteHeader /><section className="page-hero"><p className="eyebrow">Desktop application</p><h1>Peer Hours runs with you.</h1><p className="lede">The desktop application keeps your local identity and records on your device. It connects directly with peers when the network is available.</p></section><section className="download download--page"><h2>Release channels</h2><p>Signed public desktop releases are not available yet. This page will publish versioned installers, release notes, integrity checks, and supported-system guidance before asking anyone to rely on a download.</p><DownloadOptions /></section><section className="directory-notice"><h2>Free means no catch</h2><p>There is no paid tier, setup fee, investor-owned account, or required service contract. Operating independent community infrastructure is optional and remains a community choice.</p></section><SiteFooter /></main>;
}
