import type { Metadata } from "next";
import "./styles.css";

/** Defines the public site's document shell, metadata, and shared visual system. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}

/** Provides search and sharing metadata without making the public site a protocol authority. */
export const metadata: Metadata = {
  title: "Peer Hours — Time, shared locally",
  description: "A local-first, federated timebank for communities that share time and care.",
};
