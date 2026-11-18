import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageTitle, Panel, Textarea } from "@/components/ui";
import { UserError } from "@/lib/errors";
import { getThread } from "@/lib/services/inbox";
import { requireViewer } from "@/lib/session";
import { moveThreadAction, replyAction } from "../actions";
import { formatMailTime } from "../format";
import { AdminTabs } from "../../tabs";

export const metadata: Metadata = { title: "E-post" };

export default async function ThreadPage({ params }: PageProps<"/admin/innboks/[id]">) {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const { id } = await params;

  let thread: Awaited<ReturnType<typeof getThread>>;
  try {
    thread = await getThread(viewer, id);
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    return (
      <>
        <PageTitle title="E-post" />
        <AdminTabs active="innboks" />
        <p role="alert" className="max-w-[60ch] rounded-xl border border-barn p-4 text-barn">
          {error.message}
        </p>
        <p className="mt-6">
          <Link href="/admin/innboks" className="underline">Tilbake til innboksen</Link>
        </p>
      </>
    );
  }

  const canReply = thread.messages.length > 0;

  return (
    <>
      <PageTitle title={thread.subject || "(uten emne)"} />
      <AdminTabs active="innboks" />

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/admin/innboks" className="underline">← Innboksen</Link>
        {thread.folder !== "archive" && <MoveButton threadId={id} folder="archive" label="Arkiver" />}
        {thread.folder !== "trash" && <MoveButton threadId={id} folder="trash" label="Slett" />}
        {thread.folder !== "inbox" && thread.folder !== "sent" && (
          <MoveButton threadId={id} folder="inbox" label="Flytt til innboksen" />
        )}
      </div>

      <ol className="space-y-4">
        {thread.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-2xl border p-5 ${
              m.direction === "outbound" ? "border-line bg-paper" : "border-line bg-surface"
            }`}
          >
            <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
              <span className="min-w-0 break-words">
                <span className="font-semibold">
                  {m.direction === "outbound" ? `Sendt fra ${m.from}` : m.from}
                </span>
                <span className="block text-muted">
                  Til {m.to.join(", ")}
                  {m.cc.length > 0 && `, kopi til ${m.cc.join(", ")}`}
                </span>
              </span>
              <span className="text-muted">{formatMailTime(m.received_at)}</span>
            </div>
            <div className="whitespace-pre-wrap break-words">{m.body || "(tom e-post)"}</div>
            {m.attachments.length > 0 && (
              <p className="mt-3 text-sm text-muted">
                Vedlegg: {m.attachments.join(", ")}. Åpne dem i Resend.
              </p>
            )}
          </li>
        ))}
      </ol>

      {canReply && (
        <Panel className="mt-8">
          <h2 className="text-2xl font-bold">Svar</h2>
          <p className="mt-1 mb-5 text-muted">Svaret sendes fra {thread.address}.</p>
          <ActionForm action={replyAction} resetOnOk className="space-y-4">
            <input type="hidden" name="threadId" value={id} />
            <Field label="Melding">
              <Textarea name="text" rows={8} required maxLength={20000} />
            </Field>
            <SubmitButton>Send svaret</SubmitButton>
          </ActionForm>
        </Panel>
      )}
    </>
  );
}

function MoveButton({ threadId, folder, label }: { threadId: string; folder: string; label: string }) {
  return (
    <ActionForm action={moveThreadAction}>
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="folder" value={folder} />
      <button type="submit" className="cursor-pointer text-barn underline">
        {label}
      </button>
    </ActionForm>
  );
}
