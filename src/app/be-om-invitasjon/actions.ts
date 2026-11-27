"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { UserError } from "@/lib/errors";
import { notifyAdminsOfJoinRequest, requestInvitation } from "@/lib/services/join-requests";
import { pruneThrottle } from "@/lib/services/login";

export type JoinRequestState = {
  /** Satt når skjemaet er tatt imot. Adressen står i kvitteringen. */
  sentTo?: string;
  error?: string;
};

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "ukjent";
}

/**
 * Skjemaet på /be-om-invitasjon. Kvitteringen er den samme enten adressen er
 * ny, allerede med eller har spurt før, så siden røper ikke hvem som er med.
 * Reglene ligger i src/lib/services/join-requests.ts.
 */
export async function requestInvitationAction(
  _prev: JoinRequestState,
  formData: FormData,
): Promise<JoinRequestState> {
  const field = (key: string) => String(formData.get(key) ?? "");
  let created: { id: string } | null;
  try {
    created = await requestInvitation(
      {
        name: field("name"),
        email: field("email"),
        hasCabin: field("hasCabin"),
        note: field("note"),
        trap: field("la_sta_tomt"),
      },
      await clientIp(),
    );
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    console.error("Kunne ikke ta imot ønsket om invitasjon:", error);
    return { error: "Noe gikk galt hos oss. Prøv igjen om litt." };
  }

  // Varselet til administratorene sendes etter at svaret er gitt. Da tar
  // svaret like lang tid for alle.
  if (created) {
    const { id } = created;
    after(async () => {
      try {
        await notifyAdminsOfJoinRequest(id);
      } catch (error) {
        console.error("Kunne ikke varsle administratorene:", error);
      }
    });
  }
  // IP-adressen i bremsen skal ikke bli liggende lenger enn et døgn.
  after(pruneThrottle);
  return { sentTo: field("email").trim() };
}
