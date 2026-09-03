"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, apiErrorMessage } from "../../lib/api";
import { AuthFrame } from "../../components/auth-forms";
import { Button, Field, Notice, TextLink } from "../../components/ui";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) { setError("This password-reset link is missing or invalid."); return; }
    if (password.length < 8) { setError("Use at least 8 characters for your password."); return; }
    if (password !== confirmation) { setError("The passwords do not match."); return; }
    setSubmitting(true); setError("");
    try {
      await api.resetPassword(token, password);
      setComplete(true);
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason, "This password-reset link is invalid or has expired."));
    } finally { setSubmitting(false); }
  }

  return <AuthFrame title="Reset your password" description="Choose a new password for your attendance account. Resetting your password does not approve a new attendance browser.">{complete ? <div className="space-y-5"><Notice tone="success">Your password has been changed. Please sign in again.</Notice><TextLink href="/login">Return to log in</TextLink></div> : <form onSubmit={submit} className="space-y-5"><Field label="New password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" hint="Use at least 8 characters." required /><Field label="Confirm new password" name="confirmation" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />{error ? <Notice tone="error">{error}</Notice> : null}<Button className="w-full" disabled={submitting}>{submitting ? "Changing password…" : "Change password"}</Button><p className="text-center text-sm"><TextLink href="/login">Back to log in</TextLink></p></form>}</AuthFrame>;
}
