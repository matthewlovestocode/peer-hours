import Link from "next/link";
import { DownloadOptions } from "./components/DownloadOptions";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

/** Renders the public introduction and download path for the Peer Hours desktop application. */
export default function HomePage() {
  return <main>
    <SiteHeader />
    <section className="hero"><p className="eyebrow">Timebanking 2.0</p><h1>Peer Hours is for people,<br /><em>not gatekeepers.</em></h1><p className="lede">A free, peer-to-peer timebank for people who want to share time, care, and practical help—without handing their community to a company, investor, or governing body.</p><div className="actions"><a className="button button--primary" href="#download">Download Peer Hours</a><Link className="button button--quiet" href="/community-directory">Find your community</Link></div><div className="hero__note"><span className="pulse" aria-hidden="true" /> Free to use. Open source. Your identity stays with you.</div></section>
    <section className="principles" aria-label="What Peer Hours stands for"><article><span>01</span><h2>No one is in charge of you</h2><p>There is no governing authority, membership office, investor, or hidden decision-maker. People choose whom to connect with, trust, and help.</p></article><article><span>02</span><h2>It can spread person to person</h2><p>Download the desktop app, choose a community or create one with peers you know, and begin. No sales call, paid setup, certification, or expensive class required.</p></article><article><span>03</span><h2>There is no central server to shut down</h2><p>Peer Hours lives on the computers of the people using it. A website or community node can be unavailable, but neither owns your identity or community records. When peers can reach one another again, they can reconnect and replicate.</p></article></section>
    <section className="directory-callout"><div><p className="eyebrow">Start close to home</p><h2>Find a community you recognize.</h2><p>Browse communities that chose to publish their public invitation. The app verifies the signed community record before you join.</p></div><Link className="text-link" href="/community-directory">Browse directory <span aria-hidden="true">→</span></Link></section>
    <section className="download" id="download"><p className="eyebrow">Desktop application</p><h2>Download it. Find your place. Share time.</h2><p>Peer Hours is free software. Pick the locale and community where you want to bank, or start a new shared scope with people you know. There are no setup fees and no paid tier hiding behind the download.</p><DownloadOptions /></section>
    <SiteFooter />
  </main>;
}
