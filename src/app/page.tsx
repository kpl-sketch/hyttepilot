import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui";

export default function LandingPage() {
  return (
    <PublicShell>
      <h1 className="max-w-[14ch] text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
        Lån hytte av folk du kjenner.
      </h1>
      <p className="mt-6 max-w-[52ch] text-xl text-muted">
        Hytteeiere legger ut ledige perioder. Venner ber om å låne. Eieren svarer ja eller
        nei, og prisen ligger like over selvkost.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <ButtonLink href="/logg-inn">Logg inn</ButtonLink>
        <p className="text-muted">Kretsen er lukket. Du trenger en invitasjon fra en hytteeier.</p>
      </div>

      {/* Et opplyst vindu betyr at hytta er ledig. Samme gulfarge brukes i kalenderen. */}
      <svg
        viewBox="0 0 640 220"
        className="mt-14 w-full"
        role="img"
        aria-label="En hytte i skogen med lys i vinduet"
      >
        <path d="M0 220 L0 180 Q160 150 320 172 T640 160 L640 220 Z" fill="#163027" />
        <path d="M70 176 l22 -70 l22 70 z M118 180 l16 -52 l16 52 z M500 168 l24 -78 l24 78 z M552 170 l16 -50 l16 50 z" fill="#163027" />
        <path d="M250 172 v-58 l70 -46 l70 46 v58 z" fill="#a3271c" />
        <path d="M238 118 l82 -54 l82 54" fill="none" stroke="#13241d" strokeWidth="10" strokeLinejoin="round" />
        <rect x="296" y="120" width="48" height="34" fill="#f4c04e" />
        <path d="M320 120 v34 M296 137 h48" stroke="#a3271c" strokeWidth="4" />
        <rect x="352" y="72" width="14" height="30" fill="#13241d" />
      </svg>

      <dl className="mt-10 grid gap-8 sm:grid-cols-3">
        <div>
          <dt className="text-lg font-bold">Eieren bestemmer</dt>
          <dd className="mt-1 text-muted">
            Hvem som får se hytta, når den er ledig, og om svaret blir ja.
          </dd>
        </div>
        <div>
          <dt className="text-lg font-bold">Litt over selvkost</dt>
          <dd className="mt-1 text-muted">
            Strøm og faste avgifter, pluss et påslag eller vask som eieren velger.
          </dd>
        </div>
        <div>
          <dt className="text-lg font-bold">Bare folk du kjenner</dt>
          <dd className="mt-1 text-muted">
            Alle gir Hytteløftet før de blir med: Jeg behandler hytta som min egen.
          </dd>
        </div>
      </dl>
    </PublicShell>
  );
}
