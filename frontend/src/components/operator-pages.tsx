"use client";

/* Signed protected-photo URLs are returned by the backend and cannot use a static Next image host allowlist. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, apiErrorMessage, newIdempotencyKey } from "../lib/api";
import { formatDate, formatDateTime, formatTime, humanize } from "../lib/format";
import type {
  AttendanceRecord,
  AttendanceSession,
  DeviceChangeRequest,
  ManualVerificationCase,
  ParticipantSummary,
  User,
} from "../lib/types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  LoadingBlock,
  Notice,
  PageHeading,
  StatusPill,
  TextArea,
  TextLink,
} from "./ui";

function useOperatorRefresh(load: () => void, interval = 15_000) {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    loadRef.current();
    const timer = window.setInterval(() => loadRef.current(), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
}

function sessionLabel(session: AttendanceSession) {
  return `${formatDate(`${session.attendanceDate}T12:00:00`)} · ${formatTime(session.effectiveStart)}–${formatTime(session.effectiveEnd)}`;
}

function isoFromLocalInput(value: string) {
  return new Date(`${value}:00+01:00`).toISOString();
}

function courseDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localInputFromDate(value: Date) {
  const parts = courseDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function dateInputFromDate(value: Date) {
  const parts = courseDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function OperationsOverview({ user }: { user: User }) {
  const [current, setCurrent] = useState<AttendanceSession | null>(null);
  const [recent, setRecent] = useState<AttendanceSession[]>([]);
  const [manualCount, setManualCount] = useState(0);
  const [deviceCount, setDeviceCount] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(dateInputFromDate(new Date()));
  const [start, setStart] = useState(localInputFromDate(new Date()));
  const [end, setEnd] = useState(localInputFromDate(new Date(Date.now() + 3 * 60 * 60 * 1000)));
  const [reason, setReason] = useState("");
  const [extensionEnd, setExtensionEnd] = useState(localInputFromDate(new Date(Date.now() + 30 * 60 * 1000)));

  const load = async () => {
    try {
      const [active, sessions, manual, devices] = await Promise.all([
        api.currentSession(),
        api.sessions(),
        api.manualQueue(),
        api.deviceQueue(),
      ]);
      setCurrent(active);
      setRecent(sessions.items.slice(0, 6));
      setManualCount(manual.items.length);
      setDeviceCount(devices.items.length);
      setError(null);
    } catch (reasonValue) {
      setError(reasonValue);
    }
  };

  useEffect(() => { void load(); }, []);

  async function create(initialStatus: "SCHEDULED" | "OPEN") {
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const created = await api.createSession({
        attendanceDate: date,
        effectiveStart: isoFromLocalInput(start),
        effectiveEnd: isoFromLocalInput(end),
        initialStatus,
      });
      setMessage(initialStatus === "OPEN" ? "Attendance is now open." : "Attendance has been scheduled.");
      setCurrent(created.status === "OPEN" ? created : null);
      await load();
    } catch (reasonValue) {
      setError(reasonValue);
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!current || !window.confirm("Close attendance now? Participants will no longer be able to check in.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.closeSession(current.id, current.version);
      setMessage("Attendance has been closed.");
      await load();
    } catch (reasonValue) {
      setError(reasonValue);
    } finally {
      setBusy(false);
    }
  }

  async function extend() {
    if (!current || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await api.extendSession(current.id, current.version, isoFromLocalInput(extensionEnd), reason);
      setReason("");
      setMessage("The attendance end time has been extended.");
      await load();
    } catch (reasonValue) {
      setError(reasonValue);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!current || reason.trim().length < 3 || !window.confirm("Cancel this attendance session? This is recorded in the audit history.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelSession(current.id, current.version, reason);
      setReason("");
      setMessage("The attendance session has been cancelled.");
      await load();
    } catch (reasonValue) {
      setError(reasonValue);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow={user.roles.includes("ADMIN") ? "Administrator" : "Course Representative"}
        title="Attendance operations"
        description="Open the session, monitor check-ins, and keep review work visible while attendance is active."
        action={<Button variant="secondary" onClick={() => void load()}>Refresh</Button>}
      />
      {error ? <Notice tone="error">{apiErrorMessage(error)} <button className="ml-2 font-bold underline" onClick={() => void load()}>Try again</button></Notice> : null}
      {message ? <div className="mb-5"><Notice tone="success">{message}</Notice></div> : null}

      <div className="grid gap-5 sm:grid-cols-3">
        <Metric label="Current state" value={current ? humanize(current.status) : "No open session"} tone={current ? "primary" : "muted"} />
        <Metric label="Manual reviews" value={String(manualCount)} href="/operations/manual-verifications" tone={manualCount ? "warning" : "muted"} />
        <Metric label="Device requests" value={String(deviceCount)} href="/operations/manual-verifications#devices" tone={deviceCount ? "warning" : "muted"} />
      </div>

      <Card className="mt-5">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Operations tools</p>
        <h2 className="mt-2 text-lg font-bold">Manage attendance</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OperationsLink href="/operations/attendance" label="Live attendance" description="See who is present now." />
          <OperationsLink href="/operations/participants" label="Participants" description="View participants and record emergency attendance." />
          <OperationsLink href="/operations/manual-verifications" label="Review queues" description="Handle manual reviews and device changes." />
          <OperationsLink href="/operations/sessions" label="Sessions" description="Review and manage session history." />
        </div>
      </Card>

      {current ? (
        <Card className="mt-5 border-blue-100 bg-pale">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <StatusPill status={current.status} />
              <h2 className="mt-3 text-xl font-bold">{sessionLabel(current)}</h2>
              <p className="mt-1 text-sm text-muted">{current.presentCount} participant{current.presentCount === 1 ? "" : "s"} checked in · local timezone {current.timezone}</p>
            </div>
            <TextLink href="/operations/attendance">View live attendance</TextLink>
          </div>
          {current.status === "OPEN" ? (
            <div className="mt-6 grid gap-4 border-t border-blue-100 pt-5 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="New end time" type="datetime-local" value={extensionEnd} onChange={(event) => setExtensionEnd(event.target.value)} />
                <TextArea label="Reason for extension or cancellation" name="session-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="At least 3 characters" />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:justify-end">
                <Button variant="secondary" onClick={() => void extend()} disabled={busy || reason.trim().length < 3}>Extend end time</Button>
                <Button variant="danger" onClick={() => void close()} disabled={busy}>Close attendance</Button>
                <Button variant="quiet" onClick={() => void cancel()} disabled={busy || reason.trim().length < 3}>Cancel session</Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card className="mt-5">
          <h2 className="text-lg font-bold">Open or schedule attendance</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Times use the Academy timezone, Africa/Lagos. A current session can open immediately; a future start is scheduled.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Field label="Attendance date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <Field label="Start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
            <Field label="End" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => void create("OPEN")} disabled={busy}>Open attendance now</Button>
            <Button variant="secondary" onClick={() => void create("SCHEDULED")} disabled={busy}>Schedule attendance</Button>
          </div>
        </Card>
      )}

      <Card className="mt-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Recent sessions</p><h2 className="mt-2 text-lg font-bold">Session history</h2></div><TextLink href="/operations/sessions">View all</TextLink></div>
        <div className="mt-5 divide-y divide-border">{recent.length === 0 ? <EmptyState title="No sessions yet" description="Create the first attendance session above." /> : recent.map((session) => <SessionRow key={session.id} session={session} />)}</div>
      </Card>
    </>
  );
}

function Metric({ label, value, tone, href }: { label: string; value: string; tone: "primary" | "warning" | "muted"; href?: string }) {
  const content = <><p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p><p className={`mt-3 text-2xl font-bold ${tone === "primary" ? "text-primary" : tone === "warning" ? "text-amber-700" : "text-ink"}`}>{value}</p></>;
  return href ? <Link href={href} className="rounded-2xl border border-border bg-white p-5 shadow-card hover:border-blue-200">{content}</Link> : <Card>{content}</Card>;
}

function OperationsLink({ href, label, description }: { href: string; label: string; description: string }) {
  return <Link href={href} className="rounded-xl border border-border p-4 hover:border-blue-200 hover:bg-slate-50"><p className="font-bold text-ink">{label}</p><p className="mt-1 text-sm leading-5 text-muted">{description}</p></Link>;
}

function SessionRow({ session, admin = false, onChanged }: { session: AttendanceSession; admin?: boolean; onChanged?: () => void }) {
  const [reason, setReason] = useState("");
  const [reopenEnd, setReopenEnd] = useState(localInputFromDate(new Date(Date.now() + 30 * 60 * 1000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const canReopen = admin && session.status === "CLOSED" && dateInputFromDate(new Date()) === session.attendanceDate;
  async function cancelClosed() {
    if (!reason.trim() || !window.confirm("Cancel this closed session? This is recorded in the audit history.")) return;
    setBusy(true); setError(null);
    try { await api.cancelSession(session.id, session.version, reason.trim()); onChanged?.(); } catch (reasonValue) { setError(reasonValue); } finally { setBusy(false); }
  }
  async function reopen() {
    if (!canReopen || !reason.trim() || !window.confirm("Reopen this session for attendance? This is recorded in the audit history.")) return;
    setBusy(true); setError(null);
    try { await api.reopenSession(session.id, session.version, isoFromLocalInput(reopenEnd), reason.trim()); onChanged?.(); } catch (reasonValue) { setError(reasonValue); } finally { setBusy(false); }
  }
  return <div className="py-4 first:pt-0"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-ink">{sessionLabel(session)}</p><p className="mt-1 text-xs text-muted">{session.presentCount} present · version {session.version}</p></div><StatusPill status={session.status} /></div>{admin && (session.status === "CLOSED" || session.status === "DRAFT" || session.status === "SCHEDULED" || session.status === "OPEN") ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold text-ink">Administrator controls</p><p className="mt-1 text-xs leading-5 text-muted">These changes are audited. Closed sessions can be cancelled; only a closed session from today can be reopened.</p>{error ? <div className="mt-3"><Notice tone="error">{apiErrorMessage(error)}</Notice></div> : null}<div className="mt-3 grid gap-3 sm:grid-cols-2"><TextArea label="Reason" name={`session-history-reason-${session.id}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="At least 3 characters" />{canReopen ? <Field label="New closing time" type="datetime-local" value={reopenEnd} onChange={(event) => setReopenEnd(event.target.value)} /> : <div className="hidden sm:block" />}</div><div className="mt-3 flex flex-wrap gap-3">{canReopen ? <Button onClick={() => void reopen()} disabled={busy || reason.trim().length < 3}>Reopen today&apos;s session</Button> : null}<Button variant="danger" onClick={() => void cancelClosed()} disabled={busy || reason.trim().length < 3}>{session.status === "CLOSED" ? "Cancel closed session" : "Cancel session"}</Button></div></div> : null}</div>;
}

export function LiveAttendance() {
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [items, setItems] = useState<AttendanceRecord[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<unknown>(null);
  const load = async () => {
    try {
      const current = await api.currentSession();
      setSession(current);
      setItems(current ? (await api.sessionAttendance(current.id, query)).items : []);
      setError(null);
    } catch (reason) { setError(reason); }
  };
  useOperatorRefresh(load);
  return <><PageHeading eyebrow="Live attendance" title="Who is present?" description="The list refreshes periodically while the session is open. The database remains the attendance source of truth." action={<Button variant="secondary" onClick={() => void load()}>Refresh now</Button>} />{error ? <Notice tone="error">{apiErrorMessage(error)} <button className="ml-2 font-bold underline" onClick={() => void load()}>Try again</button></Notice> : null}{session ? <><Card className="mb-5 border-blue-100 bg-pale"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><StatusPill status={session.status} /><h2 className="mt-3 text-xl font-bold">{sessionLabel(session)}</h2></div><div className="text-left sm:text-right"><p className="text-3xl font-bold text-primary">{items.length}</p><p className="text-sm text-muted">present now</p></div></div></Card><Card><div className="flex flex-col gap-4 sm:flex-row sm:items-end"><Field className="flex-1" label="Search by name or serial" name="attendance-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="e.g. KSA-001" /><Button variant="secondary" onClick={() => void load()}>Search</Button></div><div className="mt-6">{items.length === 0 ? <EmptyState title="No one has checked in yet" description="New attendance records will appear here after a successful check-in." /> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><caption className="sr-only">Present participants</caption><thead className="border-b border-border text-xs uppercase tracking-wide text-muted"><tr><th className="pb-3 pr-4 font-bold">Participant</th><th className="pb-3 pr-4 font-bold">Serial</th><th className="pb-3 pr-4 font-bold">Checked in</th><th className="pb-3 font-bold">Method</th></tr></thead><tbody className="divide-y divide-border">{items.map((item) => <tr key={item.id}><td className="py-4 pr-4 font-semibold">{item.participant.fullName}</td><td className="py-4 pr-4 text-muted">{item.participant.serialNumber}</td><td className="py-4 pr-4 text-muted">{formatTime(item.checkedInAt)}</td><td className="py-4"><StatusPill status={item.method} label={item.method === "QR" ? "Automatic" : "Manual"} /></td></tr>)}</tbody></table></div>}</div></Card></> : <EmptyState title="No open attendance session" description="Open or schedule an attendance session from the operations overview." />}</>;
}

export function SessionHistory({ user }: { user: User }) {
  const [items, setItems] = useState<AttendanceSession[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = () => { setError(null); api.sessions().then((result) => setItems(result.items)).catch(setError); };
  useEffect(load, []);
  return <><PageHeading eyebrow="Operations" title="Session history" description={user.roles.includes("ADMIN") ? "Review session timing and use Administrator-only controls for closed-session corrections." : "Review session timing, state, and present counts. Closed sessions are not reopened by Course Representatives."} action={<Button variant="secondary" onClick={load}>Refresh</Button>} />{error ? <Notice tone="error">{apiErrorMessage(error)}</Notice> : items ? <Card><div className="divide-y divide-border">{items.length === 0 ? <EmptyState title="No sessions" description="Sessions created for the Academy will appear here." /> : items.map((session) => <SessionRow key={session.id} session={session} admin={user.roles.includes("ADMIN")} onChanged={load} />)}</div></Card> : <LoadingBlock label="Loading session history…" />}</>;
}

export function ParticipantSearch() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ParticipantSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantSummary | null>(null);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  async function load() {
    setError(null);
    try { const [participants, session] = await Promise.all([api.allParticipants(), api.currentSession()]); setItems(participants.items); setCurrentSession(session); } catch (reason) { setError(reason); }
  }
  useEffect(() => { void load(); }, []);
  async function recordEmergency() {
    if (!selectedParticipant || !currentSession || emergencyReason.trim().length < 3) return;
    if (!window.confirm(`Record emergency attendance for ${selectedParticipant.fullName}?`)) return;
    setEmergencyBusy(true); setError(null);
    try { await api.emergencyAttendance(selectedParticipant.id, currentSession.id, emergencyReason.trim(), newIdempotencyKey("emergency-attendance")); setSelectedParticipant(null); setEmergencyReason(""); setCurrentSession(await api.currentSession()); } catch (reason) { setError(reason); } finally { setEmergencyBusy(false); }
  }
  const visibleItems = items?.filter((participant) => `${participant.fullName} ${participant.serialNumber ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) ?? null;
  return <><PageHeading eyebrow="Operations" title="Participants" description="All active participants are shown below. Use the filter for a large roster; the list remains scrollable on smaller screens." action={<Button variant="secondary" onClick={() => void load()}>Refresh</Button>} />{error ? <div className="mb-5"><Notice tone="error">{apiErrorMessage(error)}</Notice></div> : null}{selectedParticipant ? <Card className="mb-5 border-amber-100 bg-amber-50/50"><h2 className="text-lg font-bold">Emergency attendance</h2><p className="mt-2 text-sm leading-6 text-muted">This creates a manual attendance record for the current session and is fully audited. The backend prevents recording your own attendance.</p><p className="mt-4 font-semibold">{selectedParticipant.fullName} · {selectedParticipant.serialNumber}</p><div className="mt-4 space-y-4"><TextArea label="Reason" name="emergency-reason" value={emergencyReason} onChange={(event) => setEmergencyReason(event.target.value)} placeholder="Explain why normal check-in was unavailable." /><div className="flex flex-wrap gap-3"><Button onClick={() => void recordEmergency()} disabled={emergencyBusy || emergencyReason.trim().length < 3}>Record attendance</Button><Button variant="secondary" onClick={() => { setSelectedParticipant(null); setEmergencyReason(""); }}>Cancel</Button></div></div></Card> : null}<Card><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><Field className="flex-1" label="Filter participants" name="participant-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or serial number" />{items ? <span className="pb-3 text-sm text-muted">Showing {visibleItems?.length ?? 0} of {items.length}</span> : null}</div><div className="mt-5"><Notice tone={currentSession ? "info" : "warning"}>{currentSession ? `Current session: ${sessionLabel(currentSession)}. Emergency attendance is available for eligible participants.` : "There is no open session, so emergency attendance is unavailable."}</Notice></div><div className="mt-5 max-h-[65vh] space-y-3 overflow-y-auto pr-1">{items === null ? <LoadingBlock label="Loading participants…" /> : visibleItems?.length === 0 ? <EmptyState title="No matching participants" description="Try a different name or serial number." /> : visibleItems?.map((participant) => <div key={participant.id} className="rounded-xl border border-border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-bold">{participant.fullName}</p><p className="mt-1 text-sm text-muted">{participant.serialNumber}</p><div className="mt-2 flex flex-wrap gap-2">{participant.roles.map((role) => <StatusPill key={role} status={role} label={humanize(role)} />)}</div></div><Button variant="secondary" onClick={() => setSelectedParticipant(participant)} disabled={!currentSession}>Emergency attendance</Button></div></div>)}</div></Card></>;
}

export function QueueOverview() {
  const [manual, setManual] = useState<ManualVerificationCase[] | null>(null);
  const [devices, setDevices] = useState<DeviceChangeRequest[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = async () => {
    try { const [manualResult, deviceResult] = await Promise.all([api.manualQueue(), api.deviceQueue()]); setManual(manualResult.items); setDevices(deviceResult.items); setError(null); } catch (reason) { setError(reason); }
  };
  useOperatorRefresh(load);
  return <><PageHeading eyebrow="Review queues" title="Requests needing attention" description="Automatic location uncertainty creates a manual case for review. Device changes are separate and can affect future attendance." action={<Button variant="secondary" onClick={() => void load()}>Refresh</Button>} />{error ? <Notice tone="error">{apiErrorMessage(error)}</Notice> : null}<div className="grid gap-5 lg:grid-cols-2"><Card id="manual"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Attendance</p><h2 className="mt-2 text-lg font-bold">Manual verifications</h2></div><StatusPill status="PENDING" label={manual ? `${manual.length} pending` : "Loading"} /></div><div className="mt-5 space-y-3">{manual === null ? <LoadingBlock label="Loading manual reviews…" /> : manual.length === 0 ? <EmptyState title="No manual verifications are waiting" description="This queue will remain visible when a participant requests review." /> : manual.map((item) => <ManualQueueRow key={item.id} item={item} />)}</div></Card><Card id="devices"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Access</p><h2 className="mt-2 text-lg font-bold">Device changes</h2></div><StatusPill status="PENDING" label={devices ? `${devices.length} pending` : "Loading"} /></div><div className="mt-5 space-y-3">{devices === null ? <LoadingBlock label="Loading device requests…" /> : devices.length === 0 ? <EmptyState title="No device requests are waiting" description="Participants can request a replacement browser from their profile." /> : devices.map((item) => <DeviceQueueRow key={item.id} item={item} />)}</div></Card></div></>;
}

function ManualQueueRow({ item }: { item: ManualVerificationCase }) {
  return <Link href={`/operations/manual-verifications/${item.id}`} className="block rounded-xl border border-border p-4 hover:border-blue-200 hover:bg-slate-50"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold">{item.participant.fullName}</p><p className="mt-1 text-sm text-muted">{item.participant.serialNumber} · {humanize(item.reasonCode)}</p></div><StatusPill status={item.status} /></div><p className="mt-3 text-xs text-muted">{humanize(item.creationSource)} · requested {formatDateTime(item.requestedAt)} · expires {formatDateTime(item.expiresAt)}</p></Link>;
}

function DeviceQueueRow({ item }: { item: DeviceChangeRequest }) {
  return <Link href={`/operations/device-requests/${item.id}`} className="block rounded-xl border border-border p-4 hover:border-blue-200 hover:bg-slate-50"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold">{item.participant.fullName}</p><p className="mt-1 text-sm text-muted">{item.participant.serialNumber}</p></div><StatusPill status={item.status} /></div><p className="mt-3 text-xs text-muted">Requested {formatDateTime(item.requestedAt)}</p></Link>;
}

export function ManualVerificationDetail() {
  const params = useParams<{ caseId: string }>();
  const caseId = params.caseId;
  const [item, setItem] = useState<ManualVerificationCase | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = () => { setError(null); api.manualDetail(caseId).then(setItem).catch(setError); };
  useEffect(load, [caseId]);
  async function decide(action: "approve" | "reject") {
    if (!item || reason.trim().length < 3) return;
    if (!window.confirm(`${action === "approve" ? "Approve attendance" : "Reject this review"}? This decision is recorded.`)) return;
    setBusy(true); setError(null);
    try { const next = await api.manualDecision(caseId, action, item.version, reason, action === "approve" ? newIdempotencyKey("manual-approve") : undefined); setItem(next); setReason(""); } catch (reasonValue) { setError(reasonValue); } finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="Manual verification" title={item ? item.participant.fullName : "Review attendance request"} description="Review the protected participant information and make a reasoned, auditable decision." action={<TextLink href="/operations/manual-verifications">Back to queues</TextLink>} />{error ? <Notice tone="error">{apiErrorMessage(error)} <button className="ml-2 font-bold underline" onClick={load}>Try again</button></Notice> : null}{item ? <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><Card>{item.photoAccessUrl ? <img src={item.photoAccessUrl} alt={`Protected identity photo for ${item.participant.fullName}`} className="aspect-square w-full rounded-xl object-cover" /> : <div className="grid aspect-square place-items-center rounded-xl bg-slate-100 text-center text-sm text-muted">Protected photo unavailable</div>}<div className="mt-5 space-y-3"><Detail label="Participant" value={item.participant.fullName} /><Detail label="Serial number" value={item.participant.serialNumber ?? "Not assigned"} /><Detail label="Requested" value={formatDateTime(item.requestedAt)} /><Detail label="Expires" value={formatDateTime(item.expiresAt)} /></div></Card><Card><div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold">Decision</h2><StatusPill status={item.status} /></div><dl className="mt-5 space-y-4 text-sm"><Detail label="Review source" value={humanize(item.creationSource)} /><Detail label="Reason code" value={humanize(item.reasonCode)} /><Detail label="Participant explanation" value={item.participantReason ?? "No explanation provided."} />{item.decisionReason ? <Detail label="Decision note" value={item.decisionReason} /> : null}</dl>{item.status === "PENDING" ? <div className="mt-6 border-t border-border pt-5"><TextArea label="Decision reason" name="decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this attendance is approved or rejected." /><div className="mt-4 flex flex-wrap gap-3"><Button onClick={() => void decide("approve")} disabled={busy || reason.trim().length < 3}>Approve attendance</Button><Button variant="danger" onClick={() => void decide("reject")} disabled={busy || reason.trim().length < 3}>Reject</Button></div></div> : <Notice tone="info">This review is no longer pending. Attendance records remain authoritative in the database.</Notice>}</Card></div> : <LoadingBlock label="Loading protected review…" />}</>;
}

export function DeviceRequestDetail() {
  const params = useParams<{ requestId: string }>();
  const requestId = params.requestId;
  const [item, setItem] = useState<DeviceChangeRequest | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = () => { setError(null); api.deviceDetail(requestId).then(setItem).catch(setError); };
  useEffect(load, [requestId]);
  async function decide(action: "approve" | "reject") {
    if (!item || reason.trim().length < 3) return;
    if (!window.confirm(`${action === "approve" ? "Approve device change" : "Reject device change"}?`)) return;
    setBusy(true); setError(null);
    try { const next = await api.deviceDecision(requestId, action, item.version, reason, action === "approve" ? newIdempotencyKey("device-approve") : undefined); setItem(next); setReason(""); } catch (reasonValue) { setError(reasonValue); } finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="Device change" title={item ? item.participant.fullName : "Review device request"} description="Approving this request revokes the previous attendance browser and makes the new one active." action={<TextLink href="/operations/manual-verifications#devices">Back to queues</TextLink>} />{error ? <Notice tone="error">{apiErrorMessage(error)} <button className="ml-2 font-bold underline" onClick={load}>Try again</button></Notice> : null}{item ? <Card className="max-w-2xl"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold">{item.participant.fullName}</h2><p className="mt-1 text-sm text-muted">{item.participant.serialNumber}</p></div><StatusPill status={item.status} /></div>{item.photoAccessUrl ? <img src={item.photoAccessUrl} alt={`Protected identity photo for ${item.participant.fullName}`} className="mt-5 h-48 w-48 rounded-xl object-cover" /> : null}<dl className="mt-5 space-y-4 text-sm"><Detail label="Requested" value={formatDateTime(item.requestedAt)} />{item.reviewedAt ? <Detail label="Reviewed" value={formatDateTime(item.reviewedAt)} /> : null}{item.decisionReason ? <Detail label="Decision note" value={item.decisionReason} /> : null}</dl>{item.status === "PENDING" ? <div className="mt-6 border-t border-border pt-5"><TextArea label="Decision reason" name="device-decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the device-change decision." /><div className="mt-4 flex flex-wrap gap-3"><Button onClick={() => void decide("approve")} disabled={busy || reason.trim().length < 3}>Approve device change</Button><Button variant="danger" onClick={() => void decide("reject")} disabled={busy || reason.trim().length < 3}>Reject</Button></div></div> : <Notice tone="info">This device request is no longer pending.</Notice>}</Card> : <LoadingBlock label="Loading device request…" />}</>;
}

export function SheetsAdministration() {
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.sheetsHealth>> | null>(null);
  const [scope, setScope] = useState<"MASTER_REGISTER" | "SESSION" | "SUMMARY" | "FULL">("FULL");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = () => { setError(null); api.sheetsHealth().then(setHealth).catch(setError); };
  useEffect(load, []);
  async function retry() { setBusy(true); setError(null); setMessage(""); try { const result = await api.sheetsRetry(); setMessage(`${result.queuedCount} projection job${result.queuedCount === 1 ? "" : "s"} queued for retry.`); load(); } catch (reasonValue) { setError(reasonValue); } finally { setBusy(false); } }
  async function runDueJobs() { setBusy(true); setError(null); setMessage(""); try { const result = await api.runDueJobs(); setMessage(`${result.succeeded} background job${result.succeeded === 1 ? "" : "s"} processed${result.failed ? `; ${result.failed} failed and will retry.` : "."}`); load(); } catch (reasonValue) { setError(reasonValue); } finally { setBusy(false); } }
  async function reconcile() { if (reason.trim().length < 3) return; setBusy(true); setError(null); setMessage(""); try { const result = await api.sheetsReconcile(scope, reason, newIdempotencyKey("sheets-reconcile")); setMessage(`Reconciliation job ${result.jobId} was queued.`); setReason(""); load(); } catch (reasonValue) { setError(reasonValue); } finally { setBusy(false); } }
  return <><PageHeading eyebrow="Administrator" title="Google Sheets health" description="Sheets is a projection of attendance data. The database remains authoritative if the integration is delayed or unavailable." action={<Button variant="secondary" onClick={load}>Refresh</Button>} />{error ? <Notice tone="error">{apiErrorMessage(error)}</Notice> : null}{message ? <div className="mb-5"><Notice tone="success">{message}</Notice></div> : null}{health ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Integration" value={humanize(health.status)} tone={health.status === "HEALTHY" ? "primary" : "warning"} /><Metric label="Job runner" value={humanize(health.workerStatus)} tone={health.workerStatus === "HEALTHY" ? "primary" : "warning"} /><Metric label="Pending jobs" value={String(health.pendingCount)} tone={health.pendingCount ? "warning" : "muted"} /><Metric label="Failed jobs" value={String(health.failedCount)} tone={health.failedCount ? "warning" : "muted"} /></div> : <LoadingBlock label="Checking Sheets health…" />}<Card className="mt-5"><h2 className="text-lg font-bold">Projection controls</h2><dl className="mt-5 space-y-4 text-sm"><Detail label="Provider" value={health?.provider ?? "Loading"} /><Detail label="Last successful sync" value={health?.lastSuccessfulSyncAt ? formatDateTime(health.lastSuccessfulSyncAt) : "No successful sync recorded"} />{health?.lastSanitizedError ? <Detail label="Last error" value={health.lastSanitizedError} /> : null}</dl><div className="mt-6 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => void runDueJobs()} disabled={busy}>Run due background jobs</Button><Button variant="secondary" onClick={() => void retry()} disabled={busy}>Retry pending/failed jobs</Button></div><p className="mt-3 text-sm leading-6 text-muted">The zero-cost deployment processes email, Sheets, lifecycle, and retention work in bounded batches. Automatic scheduling normally runs this action, but an Administrator can use it when a scheduled run is delayed.</p><div className="mt-6 border-t border-border pt-5"><h3 className="font-bold">Reconcile or rebuild</h3><p className="mt-1 text-sm leading-6 text-muted">Choose the smallest scope that repairs the projection and give a reason for the audit trail.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-sm font-semibold text-ink">Scope</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className="min-h-12 w-full rounded-lg border border-border bg-white px-3 text-base text-ink shadow-sm"><option value="MASTER_REGISTER">Master register</option><option value="SESSION">One session</option><option value="SUMMARY">Summary</option><option value="FULL">Full rebuild</option></select></label><TextArea label="Reason" name="reconcile-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="At least 3 characters" /></div><div className="mt-4"><Button onClick={() => void reconcile()} disabled={busy || reason.trim().length < 3}>Queue reconciliation</Button></div></div></Card></>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-muted">{label}</dt><dd className="font-semibold text-ink sm:text-right">{value}</dd></div>; }
