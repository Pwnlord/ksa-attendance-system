"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, apiErrorMessage, isApiError } from "../lib/api";
import { Button, Field, Notice, SupportLink, TextLink } from "./ui";

export function AuthFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center px-4 py-8"><div className="w-full max-w-md"><div className="mb-8 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-base font-black text-white">K</span><span className="font-bold text-ink">Kora Sales Academy</span></div><div className="rounded-2xl border border-border bg-white p-6 shadow-card sm:p-8"><h1 className="text-2xl font-bold text-ink">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p><div className="mt-6">{children}</div></div><div className="mt-6 text-center"><SupportLink /></div></div></main>;
}

export function LoginForm() {
  const router = useRouter();
  const [returnTo, setReturnTo] = useState("/home");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("returnTo");
    if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("://")) setReturnTo(value);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const result = await api.login(identifier, password);
      const destination = returnTo !== "/home" ? returnTo : result.user.roles.includes("COURSE_REP") || result.user.roles.includes("ADMIN") ? "/operations" : "/home";
      router.replace(destination);
    } catch (reason) { setError(reason); } finally { setSubmitting(false); }
  }
  return <form onSubmit={submit} className="space-y-5"><Field label="Email or serial number" name="identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="you@example.com or KSA-07" autoComplete="username" required /><label className="block"><span className="mb-1.5 block text-sm font-semibold text-ink">Password</span><input className="min-h-12 w-full rounded-lg border border-border bg-white px-3 text-base shadow-sm outline-none focus:border-primary focus:ring-4 focus:ring-blue-100" type="password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error ? <Notice tone="error">{isApiError(error) && error.code === "RATE_LIMITED" ? "Too many attempts. Please wait a little and try again." : apiErrorMessage(error, "The sign-in details are not correct.")}</Notice> : null}<Button type="submit" disabled={submitting} className="w-full">{submitting ? "Signing in…" : "Log in"}</Button><div className="flex justify-between gap-4 text-sm"><TextLink href="/forgot-password">Forgot password?</TextLink><TextLink href="/register">Create account</TextLink></div></form>;
}

export function RegistrationForm() {
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [values, setValues] = useState({ fullName: "", phone: "", email: "", password: "", serialNumber: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  function update(name: keyof typeof values, value: string) { setValues((current) => ({ ...current, [name]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    if (!photo) { setError(new Error("Choose a clear identification photo.")); return; }
    if (photo.size > 8 * 1024 * 1024) { setError(new Error("The photo must be 8 MB or smaller.")); return; }
    setSubmitting(true);
    try {
      const form = new FormData();
      Object.entries(values).forEach(([key, value]) => form.append(key, value));
      form.append("identificationPhoto", photo);
      await api.register(form);
      router.replace("/registration/success");
    } catch (reason) { setError(reason); } finally { setSubmitting(false); }
  }
  return <form onSubmit={submit} className="space-y-5"><Field label="Full name" name="fullName" value={values.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" required /><Field label="Phone number" name="phone" value={values.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" required /><Field label="Email" name="email" type="email" value={values.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required /><Field label="Password" name="password" type="password" value={values.password} onChange={(event) => update("password", event.target.value)} hint="Use at least 8 characters." autoComplete="new-password" required /><Field label="Participant serial number" name="serialNumber" value={values.serialNumber.toUpperCase()} onChange={(event) => update("serialNumber", event.target.value.toUpperCase())} placeholder="KSA-07" hint="Enter your unique Academy serial number." required /><label className="block"><span className="mb-1.5 block text-sm font-semibold text-ink">Identification photo</span><input className="block min-h-12 w-full rounded-lg border border-border bg-white px-3 py-3 text-sm" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} required /><span className="mt-1 block text-sm text-muted">A recent, clear photo. Maximum 8 MB.</span></label><Notice tone="info">Anyone can create an account. This browser becomes your approved attendance browser. Email verification is sent after registration, but it does not delay attendance.</Notice>{error ? <Notice tone="error">{apiErrorMessage(error, "We could not create your account. Check the details and try again.")}</Notice> : null}<Button type="submit" disabled={submitting} className="w-full">{submitting ? "Creating account…" : "Create account"}</Button><p className="text-center text-sm text-muted">Already have an account? <TextLink href="/login">Log in</TextLink></p></form>;
}
