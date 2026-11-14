import { redirect } from "next/navigation";

/**
 * Den gamle oversikten over hytter. Hyttene som er delt med brukeren, vises
 * nå i «Din hyttekrets». Adressen finnes fortsatt i e-post som er sendt.
 */
export default function CabinsPage() {
  redirect("/krets");
}
