import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Binærdata. Brukes til bildene, som ligger i databasen i piloten. */
const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* -------------------------------------------------------------------------- */
/* Innlogging. Disse fire tabellene eies av Better Auth. Ikke endre feltnavn.  */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  /**
   * Siste gang personen logget inn med engangskode. Settes når Better Auth
   * lager en ny økt (se databaseHooks i src/lib/auth.ts). Vises bare for
   * administratorene i medlemslisten.
   */
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Teller forsøk på å be om innloggingskode, for å bremse misbruk. */
export const loginThrottle = pgTable(
  "login_throttle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** E-postadresse eller IP-adresse, med prefiks «e:» eller «ip:». */
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_throttle_key_idx").on(t.key, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Tjenesten                                                                   */
/* -------------------------------------------------------------------------- */

/** Opplysninger brukeren gir på velkomstsiden. Finnes raden, er brukeren klar. */
export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  /**
   * BRUKES IKKE LENGER. Tidligere ga feltet innsyn i alle hytter. Nå kan alle
   * medlemmer legge inn hytte, og innsyn styres bare av `cabin_access`.
   * Kolonnen står igjen til overgangen er ferdig og kan fjernes i en senere
   * opprydding.
   */
  isOwner: boolean("is_owner").notNull().default(false),
  pledgeAcceptedAt: timestamp("pledge_accepted_at", {
    withTimezone: true,
  }).notNull(),
  pledgeVersion: text("pledge_version").notNull(),
  createdAt: createdAt(),
});

/**
 * Profilbildet til en bruker: høyst ett. Bildet ligger i databasen, slik at det
 * følger tilgangsreglene i src/lib/services/profile-photos.ts. Kolonnene `full`
 * og `thumb` hentes bare når selve bildet skal vises, aldri i lister.
 *
 * Fra LinkedIn lagres bare en kopi av bildet. Ingen nøkler, ingen
 * LinkedIn-ID og ingenting annet fra profilen tas vare på.
 */
export const profilePhoto = pgTable("profile_photo", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Kvadratisk WebP, 400 punkter. */
  full: bytea("full").notNull(),
  /** Kvadratisk WebP, 128 punkter. Brukes ved siden av navn. */
  thumb: bytea("thumb").notNull(),
  /** Hvor bildet kom fra: «linkedin» eller «upload». */
  source: text("source").notNull(),
  /** Når bildet sist ble byttet. Står også i adressen til bildet, se avatarSrc. */
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cabin = pgTable(
  "cabin",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Sted, for eksempel «Hafjell». Vises til alle som ser hytta. */
    area: text("area").notNull(),
    description: text("description").notNull().default(""),
    beds: integer("beds").notNull(),
    /** Selvkost per døgn i hele kroner (strøm og faste avgifter). */
    costPerNight: integer("cost_per_night").notNull(),
    /** Eierens påslag i prosent, for eksempel 10. */
    markupPercent: integer("markup_percent").notNull().default(0),
    /** Fast beløp for vask i hele kroner. 0 betyr at låneren vasker selv. */
    cleaningFee: integer("cleaning_fee").notNull().default(0),
    rules: text("rules").notNull().default(""),
    minAge: integer("min_age"),
    /** Mobilnummeret låneren skal vippse til. */
    vippsNumber: text("vipps_number").notNull(),
    /** Adressen til hytta. Vises til låneren når lånet er betalt. */
    address: text("address").notNull().default(""),
    /**
     * Nøyaktig plassering i grader. Vises til låneren når lånet er betalt.
     * Begge er satt, eller ingen av dem.
     */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    /** Nøkkel og veibeskrivelse. Vises til låneren når lånet er betalt. */
    arrivalInfo: text("arrival_info").notNull().default(""),
    /** Eieren vil ha e-post når hytta er åpen for lån, men ingen har spurt. */
    remindWhenIdle: boolean("remind_when_idle").notNull().default(true),
    /** Når siste påminnelse om ledig hytte ble sendt. Høyst én i måneden. */
    idleReminderSentAt: timestamp("idle_reminder_sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cabin_owner_idx").on(t.ownerId)],
);

/**
 * Bilder av en hytte. Bildene ligger i databasen, slik at de følger samme
 * tilgangskontroll som resten av hytta. Kolonnene `full` og `thumb` er store:
 * hent dem bare når selve bildet skal vises, aldri i lister.
 */
export const cabinPhoto = pgTable(
  "cabin_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinId: uuid("cabin_id")
      .notNull()
      .references(() => cabin.id, { onDelete: "cascade" }),
    /** Rekkefølgen. Bildet med lavest tall er forsidebildet. */
    position: integer("position").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Bildet i full størrelse: WebP, lengste side høyst 1600 punkter. */
    full: bytea("full").notNull(),
    /** Lite bilde til lister: WebP, lengste side høyst 640 punkter. */
    thumb: bytea("thumb").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("cabin_photo_cabin_idx").on(t.cabinId, t.position)],
);

/**
 * Hver gang en eier ber om et tekstforslag til beskrivelsen av hytta. Brukes
 * til taket per døgn og til å telle hvor ofte forslaget brukes. Selve
 * forslaget lagres ikke.
 */
export const descriptionSuggestion = pgTable(
  "description_suggestion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinId: uuid("cabin_id")
      .notNull()
      .references(() => cabin.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("description_suggestion_cabin_idx").on(t.cabinId, t.createdAt)],
);

/**
 * Deling: eieren har valgt at denne personen får se hytta og sende
 * forespørsler. Dette er den eneste kilden til innsyn i andres hytter.
 * Raden sier ingenting om ledighet, og den gir ingen rett til å dele videre.
 */
export const cabinAccess = pgTable(
  "cabin_access",
  {
    cabinId: uuid("cabin_id")
      .notNull()
      .references(() => cabin.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.cabinId, t.userId] }),
    index("cabin_access_user_idx").on(t.userId),
  ],
);

/**
 * Ledig periode. Nettene fra og med startDate til, men ikke med, endDate er
 * ledige. endDate er altså seneste avreisedag.
 */
export const availability = pgTable(
  "availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinId: uuid("cabin_id")
      .notNull()
      .references(() => cabin.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("availability_cabin_idx").on(t.cabinId)],
);

/**
 * Verdiene har navn fra første versjon og er beholdt, slik at forrige
 * kodeversjon fortsatt virker mot databasen:
 *   friend = invitasjon til én bestemt hytte (cabin_id er satt)
 *   owner  = invitasjon uten hytte, fra en administrator (cabin_id er tom)
 * Koden skiller de to på om cabin_id er satt, ikke på denne verdien.
 */
export const invitationKind = pgEnum("invitation_kind", ["owner", "friend"]);

/**
 * Invitasjon til en e-postadresse.
 * Med hytte: eieren deler én bestemt hytte med mottakeren.
 * Uten hytte: en administrator slipper mottakeren inn i tjenesten, slik at
 *   vedkommende kan legge inn egen hytte. Gir ikke innsyn i noen hytter.
 *
 * Invitasjonen er personlig: bare den som logger inn med `email`, får
 * tilgangen. `token` står i lenken i e-posten og brukes bare til å vise
 * riktig velkomst. Lenken alene gir ingen tilgang.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    kind: invitationKind("kind").notNull(),
    cabinId: uuid("cabin_id").references(() => cabin.id, {
      onDelete: "cascade",
    }),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Tilfeldig nøkkel i invitasjonslenken. Koden lager den selv. Standarden
     * i databasen finnes for rader som fantes fra før, og for forrige
     * kodeversjon.
     */
    token: text("token")
      .notNull()
      .unique()
      .default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`),
    /** Personlig hilsen fra den som inviterer. */
    message: text("message").notNull().default(""),
    createdAt: createdAt(),
    /** Etter dette tidspunktet kan invitasjonen ikke tas i bruk. */
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** Satt når eieren har trukket invitasjonen eller delingen tilbake. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("invitation_email_idx").on(t.email),
    // Høyst én gjeldende invitasjon per adresse og hytte. Da kan ikke et
    // dobbelt trykk lage to invitasjoner eller to e-poster.
    uniqueIndex("invitation_active_cabin_idx")
      .on(t.email, t.cabinId)
      .where(sql`${t.revokedAt} is null and ${t.cabinId} is not null`),
    uniqueIndex("invitation_active_account_idx")
      .on(t.email)
      .where(sql`${t.revokedAt} is null and ${t.cabinId} is null`),
  ],
);

export const bookingStatus = pgEnum("booking_status", [
  "pending", // forespørsel sendt, venter på eieren
  "approved", // eieren har sagt ja, venter på betaling
  "paid", // eieren har markert betalt, oppholdet er reservert
  "declined", // eieren har sagt nei
  "cancelled", // trukket av låneren eller avlyst av eieren
]);

export const booking = pgTable(
  "booking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinId: uuid("cabin_id")
      .notNull()
      .references(() => cabin.id, { onDelete: "cascade" }),
    borrowerId: text("borrower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Ankomstdag. */
    startDate: date("start_date", { mode: "string" }).notNull(),
    /** Avreisedag. */
    endDate: date("end_date", { mode: "string" }).notNull(),
    guests: integer("guests").notNull(),
    message: text("message").notNull().default(""),
    status: bookingStatus("status").notNull().default("pending"),
    /** Prisen slik den var da forespørselen ble sendt, i hele kroner. */
    totalPrice: integer("total_price").notNull(),
    ownerReply: text("owner_reply").notNull().default(""),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    index("booking_cabin_idx").on(t.cabinId),
    index("booking_borrower_idx").on(t.borrowerId),
  ],
);

/**
 * Noen åpnet en hytteinvitasjon og vil logge inn med en annen adresse enn den
 * invitasjonen ble sendt til, for eksempel fordi e-posten ble videresendt.
 * Personen ser ikke hytta før eieren har godkjent. Raden lages når koden
 * bestilles, og `userId` settes når personen har bekreftet adressen og
 * fullført velkomstsiden. Først da får eieren se forespørselen.
 */
export const invitationRequest = pgTable(
  "invitation_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitation.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("invitation_request_email_idx").on(t.invitationId, t.email),
    index("invitation_request_lookup_idx").on(t.email),
  ],
);

/**
 * Noen uten invitasjon har bedt om en i skjemaet på /be-om-invitasjon.
 * Raden gir ingen adgang. Bare en administrator kan gjøre den om til en
 * invitasjon (services/join-requests.ts).
 *
 * Adressen er ikke bekreftet: hvem som helst kan ha skrevet den. Tjenesten
 * sender derfor aldri e-post til den før en administrator har valgt å
 * invitere.
 */
export const joinRequest = pgTable(
  "join_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** Svaret på «Har du hytte?». Hjelper administratorene å velge. */
    hasCabin: boolean("has_cabin").notNull(),
    /** Hvem personen kjenner her, eller hvordan de hørte om tjenesten. Valgfritt. */
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
    /**
     * Satt når administratorene har fått påminnelsen om at personen venter.
     * Hver person gir høyst én påminnelse.
     */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    /** Satt når en administrator har invitert personen. */
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    /** Satt når en administrator har sagt nei eller fjernet raden fra listen. */
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    /** Administratoren som svarte. */
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    /** Invitasjonen dette førte til. */
    invitationId: uuid("invitation_id").references(() => invitation.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // Høyst én ubesvart rad per adresse. Da kan ikke et dobbelt trykk gi to
    // rader eller to varsler.
    uniqueIndex("join_request_open_idx")
      .on(t.email)
      .where(sql`${t.invitedAt} is null and ${t.declinedAt} is null`),
    index("join_request_created_idx").on(t.createdAt),
  ],
);

/**
 * Hvor langt en jobb som kjøres etter klokka, er kommet. Én rad per jobb.
 * Brukes av varselet om ny e-post i innboksen (services/inbox-notices.ts):
 * `mark` er tidspunktet for den nyeste e-posten administratorene har fått
 * varsel om. Raden sier ingenting om hvem som har skrevet, eller hva.
 */
export const jobState = pgTable("job_state", {
  key: text("key").primaryKey(),
  mark: timestamp("mark", { withTimezone: true }).notNull(),
  updatedAt: updatedAt(),
});

export type Cabin = typeof cabin.$inferSelect;
export type Booking = typeof booking.$inferSelect;
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
export type Availability = typeof availability.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
export type Profile = typeof profile.$inferSelect;
export type JoinRequest = typeof joinRequest.$inferSelect;
