import type { Metadata } from "next";
import { AudiencePage } from "@/components/audience-page";
import { AUDIENCES } from "@/lib/audiences";

const { name, audience } = AUDIENCES.v6;

export const metadata: Metadata = { title: name };

export default function Page() {
  return <AudiencePage audience={audience} number={6} />;
}
