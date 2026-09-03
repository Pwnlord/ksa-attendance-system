"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/app-shell";
import { LoadingBlock } from "../components/ui";

export default function RootPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => { if (!loading) router.replace(user?.roles.includes("COURSE_REP") || user?.roles.includes("ADMIN") ? "/operations" : user ? "/home" : "/login"); }, [loading, router, user]);
  return <main className="mx-auto max-w-xl px-4 py-12"><LoadingBlock label="Opening Kora Attendance…" /></main>;
}
