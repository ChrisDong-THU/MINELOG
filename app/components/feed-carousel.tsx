import type { CSSProperties } from "react";
import type { FeedEntry } from "../content-types";

export function FeedCarousel({
  entries,
  arrow,
  onOpen,
}: {
  entries: FeedEntry[];
  arrow: string;
  onOpen: (entry: FeedEntry) => void;
}) {
  const rotating = entries.length > 3;
  const visibleEntries = rotating ? [...entries, ...entries] : entries;
  const timing = { "--feed-duration": `${entries.length * 4}s` } as CSSProperties;

  return <div className={`post-list feed-carousel ${rotating ? "is-rotating" : "is-static"}`} style={timing} data-count={entries.length}>
    <div className="feed-track">{visibleEntries.map((entry, index) =>
      <button
        className="post-entry"
        key={`${entry[4] ?? entry[0]}:${entry[1]}:${index}`}
        aria-hidden={rotating && index >= entries.length ? true : undefined}
        tabIndex={rotating && index >= entries.length ? -1 : 0}
        onClick={() => onOpen(entry)}
      >
        <span className="entry-copy"><small>{entry[0]} · {entry[2]}</small><strong>{entry[1]}</strong></span>
        <span className="entry-read">{entry[3]} <img className="entry-arrow" src={arrow} alt="" /></span>
      </button>)}</div>
  </div>;
}
