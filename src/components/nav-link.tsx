"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  also,
  children,
}: {
  href: string;
  /** En adresse til som hører til samme menypunkt. */
  also?: string;
  children: string;
}) {
  const path = usePathname();
  const active = path.startsWith(href) || (also !== undefined && path.startsWith(also));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`border-b-2 py-1.5 font-semibold ${
        active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
