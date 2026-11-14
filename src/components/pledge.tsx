import { PLEDGE_INTRO, PLEDGE_OUTRO, PLEDGE_POINTS } from "@/lib/pledge";

/** Hytteløftet: sju løfter alle gir før de blir med. */
export function Pledge() {
  return (
    <div>
      <p className="max-w-[60ch]">{PLEDGE_INTRO}</p>
      <ol className="mt-4 max-w-[60ch] list-decimal space-y-3 pl-6 marker:font-bold marker:text-barn">
        {PLEDGE_POINTS.map((point) => (
          <li key={point.title}>
            <strong>{point.title}</strong> {point.body}
          </li>
        ))}
      </ol>
      <p className="mt-4 max-w-[60ch] text-muted">{PLEDGE_OUTRO}</p>
    </div>
  );
}
