import Link from "next/link";

/** Faner øverst i administrasjonen. */
export function AdminTabs({ active }: { active: "invitasjoner" | "medlemmer" | "tall" }) {
  const tabs = [
    { key: "invitasjoner", href: "/admin", label: "Invitasjoner" },
    { key: "medlemmer", href: "/admin/medlemmer", label: "Medlemmer" },
    { key: "tall", href: "/admin/tall", label: "Tall" },
  ] as const;
  return (
    <nav aria-label="Administrasjon" className="mb-8 flex gap-6 border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 py-2 font-semibold ${
            tab.key === active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
