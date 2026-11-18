import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, PageTitle, Panel, Textarea } from "@/components/ui";
import { inboxSetup } from "@/lib/services/inbox";
import { requireViewer } from "@/lib/session";
import { sendNewAction } from "../actions";
import { AdminTabs } from "../../tabs";

export const metadata: Metadata = { title: "Ny e-post" };

export default async function NewEmailPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const setup = inboxSetup();

  return (
    <>
      <PageTitle title="Ny e-post" />
      <AdminTabs active="innboks" />
      <p className="mb-6">
        <Link href="/admin/innboks" className="underline">← Innboksen</Link>
      </p>
      {setup.ok ? (
        <Panel>
          <p className="mb-5 text-muted">Sendes fra {setup.address}.</p>
          <ActionForm action={sendNewAction} className="space-y-4">
            <Field label="Til" className="max-w-md">
              <Input name="to" type="email" autoComplete="off" required />
            </Field>
            <Field label="Emne" className="max-w-xl">
              <Input name="subject" required maxLength={300} />
            </Field>
            <Field label="Melding">
              <Textarea name="text" rows={10} required maxLength={20000} />
            </Field>
            <SubmitButton>Send</SubmitButton>
          </ActionForm>
        </Panel>
      ) : (
        <p role="alert" className="max-w-[60ch] rounded-xl border border-barn p-4 text-barn">
          {setup.reason}
        </p>
      )}
    </>
  );
}
