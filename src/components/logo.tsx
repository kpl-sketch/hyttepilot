import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

/**
 * Navnet med et lite merke: en rød hytte med lys i vinduet.
 * Merket er pynt og skjules for skjermlesere. Navnet leses som før.
 */
export function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-xl font-bold text-barn">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <path d="M4 15 16 5l12 10v13H4z" fill="currentColor" />
        <path d="M2 16 16 4l14 12" fill="none" stroke="#1d2327" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="13" y="16" width="7" height="6" rx="0.5" fill="#f4c04e" />
      </svg>
      {APP_NAME}
    </Link>
  );
}
