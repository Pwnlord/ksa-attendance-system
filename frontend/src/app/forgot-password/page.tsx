"use client";

import { FormEvent, useState } from "react";
import { api, apiErrorMessage } from "../../lib/api";
import { AuthFrame } from "../../components/auth-forms";
import { Button, Field, Notice, TextLink } from "../../components/ui";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSubmitting(true); setError(""); try { await api.forgotPassword(identifier); setSent(true); } catch (reason) { setError(apiErrorMessage(reason)); } finally { setSubmitting(false); } }
  return <AuthFrame title="Recover your account" description="Enter your email. We will show the same confirmation whether recovery is available or not.">{sent ? <div className="space-y-5"><Notice tone="success">If a verified email matches, a recovery link will be sent shortly.</Notice><TextLink href="/login">Return to log in</TextLink></div> : <form onSubmit={submit} className="space-y-5"><Field label="Email" name="identifier" type="email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="email" required />{error ? <Notice tone="error">{error}</Notice> : null}<Button className="w-full" disabled={submitting}>{submitting ? "Sending…" : "Send recovery link"}</Button><p className="text-center text-sm"><TextLink href="/login">Back to log in</TextLink></p></form>}</AuthFrame>;
}
