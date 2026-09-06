"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, apiErrorMessage, isApiError } from "../lib/api";
import { Button, Field, Notice, SupportLink, TextLink } from "./ui";

type RegistrationValues = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  serialNumber: string;
};

type RegistrationField = keyof RegistrationValues | "photo";
type RegistrationErrors = Partial<Record<RegistrationField, string>>;

const registrationFields = new Set<RegistrationField>([
  "fullName",
  "phone",
  "email",
  "password",
  "serialNumber",
  "photo",
]);

function validateRegistration(values: RegistrationValues, photo: File | null): RegistrationErrors {
  const errors: RegistrationErrors = {};
  const fullName = values.fullName.trim();
  const phone = values.phone.normalize("NFKC").trim().replace(/[\s().-]/g, "");
  const email = values.email.trim();
  const serialNumber = values.serialNumber.normalize("NFKC").trim().toUpperCase();

  if (!fullName) errors.fullName = "Enter your full name.";
  else if (fullName.length < 2) errors.fullName = "Use at least 2 characters for your full name.";
  else if (fullName.length > 150) errors.fullName = "Use no more than 150 characters for your full name.";

  if (!phone) errors.phone = "Enter your phone number.";
  else if (!/^\+?[0-9]{7,15}$/.test(phone)) errors.phone = "Enter a valid phone number.";

  if (!email) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  else if (email.length > 320) errors.email = "Use no more than 320 characters for your email.";

  if (!values.password) errors.password = "Enter a password.";
  else if (values.password.length < 8) errors.password = "Use at least 8 characters for your password.";
  else if (values.password.length > 256) errors.password = "Use no more than 256 characters for your password.";

  if (!serialNumber) errors.serialNumber = "Enter your participant serial number.";
  else if (!/^KSA-[0-9]{2}$/.test(serialNumber)) errors.serialNumber = "Use the format KSA-07 for your serial number.";

  if (!photo) errors.photo = "Choose a clear identification photo.";
  else if (photo.size > 8 * 1024 * 1024) errors.photo = "The photo must be 8 MB or smaller.";
  else if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
    errors.photo = "Upload a JPG, PNG, or WebP image.";
  }

  return errors;
}

function registrationApiErrors(error: unknown): RegistrationErrors {
  if (!isApiError(error)) return {};
  const result: RegistrationErrors = {};
  const fields = error.details.fields;
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    for (const [field, value] of Object.entries(fields)) {
      if (!registrationFields.has(field as RegistrationField)) continue;
      const message = Array.isArray(value)
        ? value.find((item): item is string => typeof item === "string")
        : typeof value === "string"
          ? value
          : undefined;
      if (message) result[field as RegistrationField] = message;
    }
  }
  const field = error.details.field;
  if (typeof field === "string" && registrationFields.has(field as RegistrationField)) {
    result[field as RegistrationField] = error.message;
  }
  if (error.code === "PHOTO_TOO_LARGE") result.photo = error.message;
  if (error.code === "PHOTO_UNSUPPORTED") result.photo = error.message;
  return result;
}

function focusRegistrationField(field: RegistrationField | undefined): void {
  if (!field) return;
  window.requestAnimationFrame(() => {
    document.getElementById(field === "photo" ? "identificationPhoto" : field)?.focus();
  });
}

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
  const [values, setValues] = useState<RegistrationValues>({ fullName: "", phone: "", email: "", password: "", serialNumber: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<RegistrationErrors>({});
  function clearFieldError(field: RegistrationField): void {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError(null);
  }
  function update(name: keyof RegistrationValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    clearFieldError(name);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const validationErrors = validateRegistration(values, photo);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      focusRegistrationField(Object.keys(validationErrors)[0] as RegistrationField | undefined);
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      Object.entries(values).forEach(([key, value]) => form.append(key, value));
      form.append("identificationPhoto", photo as File);
      await api.register(form);
      router.replace("/registration/success");
    } catch (reason) {
      const nextFieldErrors = registrationApiErrors(reason);
      setFieldErrors(nextFieldErrors);
      if (Object.keys(nextFieldErrors).length > 0) focusRegistrationField(Object.keys(nextFieldErrors)[0] as RegistrationField | undefined);
      setError(Object.keys(nextFieldErrors).length > 0 ? null : reason);
    } finally { setSubmitting(false); }
  }
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  return (
    <form onSubmit={submit} noValidate aria-busy={submitting} className="space-y-5">
      <Field label="Full name" name="fullName" value={values.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" required error={fieldErrors.fullName} />
      <Field label="Phone number" name="phone" value={values.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" required error={fieldErrors.phone} />
      <Field label="Email" name="email" type="email" value={values.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required error={fieldErrors.email} />
      <Field label="Password" name="password" type="password" value={values.password} onChange={(event) => update("password", event.target.value)} hint="Use at least 8 characters." autoComplete="new-password" required error={fieldErrors.password} />
      <Field label="Participant serial number" name="serialNumber" value={values.serialNumber.toUpperCase()} onChange={(event) => update("serialNumber", event.target.value.toUpperCase())} placeholder="KSA-07" hint="Enter your unique Academy serial number." required error={fieldErrors.serialNumber} />
      <label className="block" htmlFor="identificationPhoto">
        <span className="mb-1.5 block text-sm font-semibold text-ink">Identification photo</span>
        <input
          id="identificationPhoto"
          name="identificationPhoto"
          className={`block min-h-12 w-full rounded-lg border bg-white px-3 py-3 text-sm ${fieldErrors.photo ? "border-danger" : "border-border"}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            setPhoto(event.target.files?.[0] ?? null);
            clearFieldError("photo");
          }}
          required
          aria-invalid={fieldErrors.photo ? true : undefined}
          aria-describedby={fieldErrors.photo ? "identificationPhoto-error" : "identificationPhoto-hint"}
        />
        {fieldErrors.photo ? <span id="identificationPhoto-error" className="mt-1 block text-sm text-danger">{fieldErrors.photo}</span> : <span id="identificationPhoto-hint" className="mt-1 block text-sm text-muted">A recent, clear photo. Maximum 8 MB.</span>}
      </label>
      <Notice tone="info">One browser can be assigned to one participant account. This first account becomes the approved attendance account for this browser. If you need another account, use a separate browser profile. Clearing cookies later will require device approval again.</Notice>
      {hasFieldErrors ? <Notice tone="error">Please correct the highlighted fields before continuing.</Notice> : error ? <Notice tone="error">{apiErrorMessage(error, "We could not create your account. Check the details and try again.")}</Notice> : null}
      {submitting ? <Notice tone="info">Creating your account and securely processing your photo. Please keep this page open.</Notice> : null}
      <Button type="submit" disabled={submitting} className="w-full"><>{submitting ? <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : null}{submitting ? "Creating account…" : "Create account"}</></Button>
      <p className="text-center text-sm text-muted">Already have an account? <TextLink href="/login">Log in</TextLink></p>
    </form>
  );
}
