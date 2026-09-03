"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import type { User } from "../../../lib/types";
import { Button, LoadingBlock, Notice, TextLink } from "../../../components/ui";

export default function RegistrationSuccessPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { api.session().then((result) => setUser(result.user)).catch(() => router.replace("/login")); }, [router]);
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><LoadingBlock label="Preparing your account…" /></main>;
  return <main className="flex min-h-screen items-center justify-center px-4 py-8"><div className="w-full max-w-md rounded-2xl border border-border bg-white p-7 text-center shadow-card"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-2xl text-success" aria-hidden="true">✓</div><h1 className="mt-5 text-2xl font-bold text-ink">Your account is ready</h1><p className="mt-2 text-muted">Welcome, {user.fullName}. Your participant serial is <strong>{user.serialNumber}</strong>.</p><Notice tone="success">This browser is registered for attendance. Email verification is helpful for account recovery but does not delay attendance.</Notice><Button className="mt-6 w-full" onClick={() => router.replace("/home")}>Continue</Button><p className="mt-4 text-sm"><TextLink href="/profile">Review your profile</TextLink></p></div></main>;
}
