import { todayInOslo } from "@/lib/dates";
import { listMembers, membersToCsv } from "@/lib/services/members";
import { getViewer } from "@/lib/session";

/** Medlemslisten som CSV-fil. Bare for administratorer. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return new Response(null, { status: 404 });
  const csv = membersToCsv(await listMembers(viewer));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="medlemmer-${todayInOslo()}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
