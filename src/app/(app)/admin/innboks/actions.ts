"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { type FormState, toFormState } from "@/lib/errors";
import { moveThread, replyToThread, sendNewEmail } from "@/lib/services/inbox";
import { requireViewer } from "@/lib/session";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

export async function replyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await replyToThread(viewer, text(formData, "threadId"), text(formData, "text"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return { ok: "Svaret er sendt." };
}

export async function sendNewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await sendNewEmail(viewer, {
      to: text(formData, "to"),
      subject: text(formData, "subject"),
      text: text(formData, "text"),
    });
  } catch (error) {
    return toFormState(error);
  }
  redirect("/admin/innboks?mappe=sent&endret=sendt");
}

export async function moveThreadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const folder = text(formData, "folder");
  if (folder !== "inbox" && folder !== "archive" && folder !== "trash") {
    return { error: "Ukjent mappe." };
  }
  try {
    await moveThread(viewer, text(formData, "threadId"), folder);
  } catch (error) {
    return toFormState(error);
  }
  redirect(`/admin/innboks?endret=${folder}`);
}
