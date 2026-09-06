"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { primaryRoleLabel } from "../lib/format";
import type { Role, User } from "../lib/types";
import { Button, LoadingBlock, TextLink } from "./ui";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    api.session().then((result) => {
      if (active) setUser(result.user);
    }).catch((reason: unknown) => {
      if (active && (!(reason instanceof ApiError) || reason.status !== 401)) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  return { user, loading, error, setUser };
}

export function Protected({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
  }, [auth.loading, auth.user, pathname, router]);
  useEffect(() => {
    const authenticatedUser = auth.user;
    if (!auth.loading && authenticatedUser && roles && !roles.some((role) => authenticatedUser.roles.includes(role))) router.replace("/home");
  }, [auth.loading, auth.user, roles, router]);
  const authenticatedUser = auth.user;
  if (auth.loading || !authenticatedUser) return <main className="mx-auto max-w-xl px-4 py-12"><LoadingBlock label="Checking your sign-in…" /></main>;
  if (roles && !roles.some((role) => authenticatedUser.roles.includes(role))) return <main className="mx-auto max-w-xl px-4 py-12"><LoadingBlock label="Taking you to your dashboard…" /></main>;
  return <AppShell user={authenticatedUser}>{children}</AppShell>;
}

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const operator = user.roles.includes("COURSE_REP") || user.roles.includes("ADMIN");
  const participant = user.roles.includes("PARTICIPANT");
  const links = [
    ...(participant ? [{ href: "/home", label: "My home" }, { href: "/attendance", label: "My attendance" }, { href: "/history", label: "My history" }, { href: "/profile", label: "My profile" }] : []),
    ...(operator ? [{ href: "/operations", label: "Operations" }, { href: "/operations/attendance", label: "Live attendance" }, { href: "/operations/participants", label: "Participants" }, { href: "/operations/manual-verifications", label: "Review queues" }, { href: "/operations/sessions", label: "Sessions" }] : []),
    ...(user.roles.includes("ADMIN") ? [{ href: "/admin/roster", label: "Roster" }, { href: "/admin/roles", label: "Roles" }, { href: "/admin/config", label: "Course setup" }, { href: "/admin/photo-requests", label: "Photo reviews" }, { href: "/admin/attendance-corrections", label: "Corrections" }, { href: "/admin/audit", label: "Audit log" }, { href: "/admin/sheets", label: "Sheets" }] : []),
  ];
  async function signOut() {
    await api.logout().catch(() => undefined);
    router.replace("/login");
  }
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href={operator ? "/operations" : "/home"} className="flex items-center gap-3 text-ink">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-sm font-black text-white">K</span>
            <span className="hidden text-sm font-bold sm:block">Kora Sales Academy</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-right"><span className="hidden text-sm text-muted sm:block">{user.fullName}</span><span className="block text-xs font-semibold text-primary">{primaryRoleLabel(user.roles)}</span></span>
            <Button variant="quiet" onClick={signOut} className="px-3">Log out</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 pb-24 sm:px-6 lg:py-8 lg:pb-8">
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav aria-label="Main navigation" className="sticky top-6 space-y-1">
            {links.map((link) => <NavItem key={link.href} {...link} active={pathname === link.href || pathname.startsWith(`${link.href}/`)} />)}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-20 overflow-x-auto border-t border-border bg-white/95 px-2 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex min-w-max justify-around gap-1">{links.map((link) => <NavItem key={link.href} {...link} active={pathname === link.href || pathname.startsWith(`${link.href}/`)} mobile />)}</div>
      </nav>
    </div>
  );
}

function NavItem({ href, label, active, mobile = false }: { href: string; label: string; active: boolean; mobile?: boolean }) {
  return <Link href={href} className={`${mobile ? "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px]" : "block rounded-lg px-3 py-3 text-sm"} ${active ? "bg-pale font-bold text-primary" : "text-muted hover:bg-slate-50 hover:text-ink"}`}><span aria-hidden="true" className={mobile ? "text-base" : "hidden"}>●</span>{label}</Link>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow ? <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</p> : null}<h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>{description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}</div>{action}</div>;
}

export function apiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  return error instanceof ApiError ? error.message : fallback;
}

export function SupportLink() {
  return <p className="text-sm text-muted">Need help? <TextLink href="mailto:attendance@korasalesacademy.example">Contact the Administrator</TextLink>.</p>;
}
