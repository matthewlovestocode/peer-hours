/** Presents unavailable desktop release channels without implying that a download exists today. */
export function DownloadOptions() {
  return <div className="download__options"><button type="button" disabled>macOS <small>Coming soon</small></button><button type="button" disabled>Windows <small>Coming soon</small></button><button type="button" disabled>Linux <small>Coming soon</small></button></div>;
}
