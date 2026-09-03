"use client";

import { useEffect, useState } from "react";
import { api, apiErrorMessage, isApiError, newIdempotencyKey } from "../lib/api";
import { formatDate, formatDateTime, formatTime, humanize } from "../lib/format";
import type { AttendanceContext, AttendanceHistoryEntry, DeviceChangeRequest, ManualVerificationCase, User } from "../lib/types";
import { Button, Card, EmptyState, Field, LoadingBlock, Notice, PageHeading, StatusPill, TextArea, TextLink } from "./ui";

export function ParticipantHome({ user }: { user: User }) {
  const [context, setContext] = useState<AttendanceContext | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryEntry[]>([]);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { Promise.all([api.attendanceContext(), api.history()]).then(([current, past]) => { setContext(current); setHistory(past.items); }).catch(setError); }, []);
  return <><PageHeading eyebrow="Participant" title={`Welcome, ${user.fullName}`} description={`Serial number ${user.serialNumber ?? "not assigned"}. Here is your attendance status.`} /><div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">{error ? <Notice tone="error">{apiErrorMessage(error)} <button className="ml-2 font-bold underline" onClick={() => window.location.reload()}>Try again</button></Notice> : context ? <TodayCard context={context} /> : <LoadingBlock label="Checking today's attendance…" />}<Card><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Recent history</p><h2 className="mt-2 text-lg font-bold">Your attendance</h2></div><TextLink href="/history">View all</TextLink></div><div className="mt-5 space-y-3">{history.length === 0 ? <p className="text-sm text-muted">No sessions have been recorded yet.</p> : history.slice(0, 4).map((item) => <HistoryRow key={item.sessionId} item={item} />)}</div></Card></div></>;
}

function TodayCard({ context }: { context: AttendanceContext }) {
  if (context.state === "ALREADY_PRESENT" && context.attendanceRecord) return <Card className="border-emerald-100 bg-emerald-50/50"><StatusPill status="PRESENT" label="You're present" /><h2 className="mt-4 text-2xl font-bold">Attendance recorded</h2><p className="mt-2 text-sm text-muted">You checked in at {formatTime(context.attendanceRecord.checkedInAt)}. You can close this page.</p><TextLink href="/history" className="mt-5 inline-block">View attendance history</TextLink></Card>;
  if (context.state === "OPEN") return <Card className="border-blue-100 bg-pale"><StatusPill status="OPEN" label="Attendance open" /><h2 className="mt-4 text-2xl font-bold">Ready to check in?</h2><p className="mt-2 text-sm text-muted">Attendance is open until {context.session ? formatTime(context.session.effectiveEnd) : "the session closes"}. Check-in starts automatically on the next page.</p>{context.deviceStatus === "REGISTERED_BROWSER" ? <TextLink href="/check-in" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-bold text-white no-underline hover:bg-blue-700">Check in</TextLink> : <div className="mt-5"><Notice tone="warning">This browser needs approval before it can record attendance.</Notice><TextLink href="/profile" className="mt-3 inline-block">Request device change</TextLink></div>}</Card>;
  return <Card><StatusPill status={context.state === "CLOSED" ? "CLOSED" : "NOT_OPEN"} label={context.state === "CLOSED" ? "Attendance closed" : "Not open yet"} /><h2 className="mt-4 text-2xl font-bold">{context.state === "CLOSED" ? "Today's session has ended" : "Attendance is not currently open"}</h2><p className="mt-2 text-sm text-muted">When the Academy opens attendance, this card will update with your check-in option.</p></Card>;
}

function HistoryRow({ item }: { item: AttendanceHistoryEntry }) {
  const status = item.attendanceStatus === "PRESENT" ? "PRESENT" : item.attendanceStatus === "ABSENT" ? "ABSENT" : "NOT_APPLICABLE";
  return <div className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"><div><p className="font-semibold text-ink">{formatDate(`${item.attendanceDate}T12:00:00`)}</p><p className="mt-1 text-xs text-muted">{humanize(item.sessionStatus)}</p></div><StatusPill status={status} label={status === "NOT_APPLICABLE" ? "N/A" : status} /></div>;
}

export function ParticipantHistory() {
  const [items, setItems] = useState<AttendanceHistoryEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  function load() { setError(null); api.history().then((result) => setItems(result.items)).catch(setError); }
  useEffect(load, []);
  return <><PageHeading eyebrow="Attendance" title="Your attendance history" description="See your recorded sessions, including sessions that were not applicable to your enrollment." action={<Button variant="secondary" onClick={load}>Refresh</Button>} />{error ? <Notice tone="error">{apiErrorMessage(error)} <button className="ml-2 font-bold underline" onClick={load}>Try again</button></Notice> : items ? <Card><div className="divide-y divide-border">{items.length === 0 ? <EmptyState title="No attendance history" description="Your session history will appear here." /> : items.map((item) => <div key={item.sessionId} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-ink">{formatDate(`${item.attendanceDate}T12:00:00`)}</p><p className="mt-1 text-sm text-muted">Session {humanize(item.sessionStatus)}{item.record ? ` · ${humanize(item.record.method)}` : ""}</p></div><StatusPill status={item.attendanceStatus} label={item.attendanceStatus === "NOT_APPLICABLE" ? "N/A" : humanize(item.attendanceStatus)} /></div>)}</div></Card> : <LoadingBlock label="Loading your history…" />}</>;
}

export function ParticipantProfile({ initialUser }: { initialUser: User }) {
  const [user, setUser] = useState(initialUser);
  const [device, setDevice] = useState<{ browserStatus: string; pendingRequest: DeviceChangeRequest | null } | null>(null);
  const [requests, setRequests] = useState<DeviceChangeRequest[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  function load() { Promise.all([api.session(), api.deviceStatus(), api.deviceRequests()]).then(([session, current, history]) => { setUser(session.user); setDevice(current); setRequests(history.items); }).catch(setError); }
  useEffect(load, []);
  async function requestDevice() { setSubmitting(true); setError(null); setMessage(""); try { await api.deviceRequest(note); setMessage("Your device-change request is waiting for review."); setNote(""); load(); } catch (reason) { setError(reason); } finally { setSubmitting(false); } }
  return <><PageHeading eyebrow="Profile" title="Your profile" description="Keep your account details current. Your participant serial cannot be changed here." /><div className="grid gap-5 lg:grid-cols-2"><Card><h2 className="text-lg font-bold">Account details</h2><dl className="mt-5 space-y-4 text-sm"><Detail label="Name" value={user.fullName} /><Detail label="Serial number" value={user.serialNumber ?? "Not assigned"} /><Detail label="Phone" value={user.phone ?? "Not provided"} /><Detail label="Email" value={user.email} /><Detail label="Email status" value={user.emailVerifiedAt ? "Verified" : "Unverified — attendance is still available"} /></dl></Card><Card><h2 className="text-lg font-bold">Attendance browser</h2><p className="mt-2 text-sm leading-6 text-muted">Attendance is tied to this browser separately from your sign-in. Clearing site data or changing browsers may require approval.</p><div className="mt-5">{device ? <StatusPill status={device.browserStatus} /> : <LoadingBlock label="Checking browser status…" />}</div>{message ? <div className="mt-4"><Notice tone="success">{message}</Notice></div> : null}{error ? <div className="mt-4"><Notice tone="error">{apiErrorMessage(error)}</Notice></div> : null}{device?.pendingRequest ? <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">A replacement request is already waiting for review.</div> : <div className="mt-5 space-y-3"><TextArea label="Optional note" name="device-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tell the reviewer why you need a new browser approved." /><Button onClick={requestDevice} disabled={submitting}>{submitting ? "Sending request…" : "Request device change"}</Button></div>}</Card></div><Card className="mt-5"><h2 className="text-lg font-bold">Device request history</h2><div className="mt-4 space-y-3">{requests.length === 0 ? <p className="text-sm text-muted">No device-change requests yet.</p> : requests.map((request) => <div key={request.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-muted">Requested {formatDateTime(request.requestedAt)}</span><StatusPill status={request.status} /></div>)}</div></Card></>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-muted">{label}</dt><dd className="font-semibold text-ink sm:text-right">{value}</dd></div>; }

export function CheckInFlow() {
  const [context, setContext] = useState<AttendanceContext | null>(null);
  const [result, setResult] = useState<CheckInResultState>(null);
  const [error, setError] = useState<unknown>(null);
  const [reason, setReason] = useState("");
  const [requesting, setRequesting] = useState(false);
  useEffect(() => { api.attendanceContext().then(setContext).catch(setError); }, []);
  useEffect(() => {
    if (!context || context.state !== "OPEN" || context.deviceStatus !== "REGISTERED_BROWSER" || result) return;
    const key = newIdempotencyKey("attendance");
    let cancelled = false;
    let retryTimer: number | undefined;
    const succeed = (body: Parameters<typeof api.checkIn>[0]) => {
      if (!cancelled) void api.checkIn(body, key).then(setResult).catch(setError);
    };
    if (!navigator.geolocation) { succeed({ locationFailure: "UNSUPPORTED" }); return () => { cancelled = true; }; }
    const requestLocation = (attempt: number) => {
      if (cancelled) return;
      navigator.geolocation.getCurrentPosition(
        (position) => succeed({ location: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMetres: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() } }),
        (positionError) => {
          if (cancelled) return;
          if (positionError.code === 3 && attempt === 0) {
            retryTimer = window.setTimeout(() => requestLocation(1), 250);
            return;
          }
          succeed({ locationFailure: positionError.code === 1 ? "PERMISSION_DENIED" : positionError.code === 3 ? "TIMEOUT" : "UNAVAILABLE" });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: Math.max(1, context.locationAcquisitionTimeoutSeconds) * 1_000 },
      );
    };
    requestLocation(0);
    return () => { cancelled = true; if (retryTimer !== undefined) window.clearTimeout(retryTimer); };
  }, [context, result]);
  async function requestManual() { if (!result?.attemptId || !reason.trim()) return; setRequesting(true); try { const response = await api.manualRequest(result.attemptId, reason, newIdempotencyKey("manual")); setResult((current) => current ? { ...current, manualVerificationCase: response } : current); } catch (reasonValue) { setError(reasonValue); } finally { setRequesting(false); } }
  if (error) return <CheckInState title="Attendance could not be checked" description={apiErrorMessage(error, "We could not complete attendance. Your attendance has not been confirmed.")} tone="error"><Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button></CheckInState>;
  if (!context) return <main className="mx-auto max-w-xl px-4 py-12"><LoadingBlock label="Checking attendance…" /></main>;
  if (context.state === "NOT_OPEN") return <CheckInState title="Attendance is not currently open" description="Please return when the Academy opens today's attendance." />;
  if (context.state === "CLOSED") return <CheckInState title="Today's attendance session has ended" description="If you were physically present, please speak with the Course Representative or Administrator." />;
  if (context.state === "ALREADY_PRESENT" && context.attendanceRecord) return <CheckInState title="You're already checked in" description={`Your attendance was recorded at ${formatTime(context.attendanceRecord.checkedInAt)}. You can close this page.`} tone="success"><TextLink href="/history">View attendance history</TextLink></CheckInState>;
  if (context.deviceStatus !== "REGISTERED_BROWSER") return <CheckInState title="This browser needs approval" description="Your account is available, but attendance can only be recorded from an approved browser." tone="warning"><TextLink href="/profile">Request device change</TextLink></CheckInState>;
  if (!result) return <CheckInState title="Verifying attendance…" description={`Getting a precise GPS location. We will wait up to ${context.locationAcquisitionTimeoutSeconds} seconds and retry once if needed.`} loading />;
  if (result.outcome === "ATTENDANCE_RECORDED" || result.outcome === "ALREADY_CHECKED_IN") return <CheckInState title={result.outcome === "ALREADY_CHECKED_IN" ? "You're already checked in" : "You're present"} description={`Attendance was recorded at ${formatTime(result.serverTime)}. You can close this page.`} tone="success"><TextLink href="/history">View attendance history</TextLink></CheckInState>;
  const manualCase = result.manualVerificationCase;
  const locationMessage = result.outcome === "LOCATION_TIMEOUT"
    ? "Your phone did not provide a GPS fix in time. Turn on precise location, move near a window or outdoors, and try again."
    : result.outcome === "LOCATION_PERMISSION_DENIED"
      ? "Location permission was not granted. Allow precise location for this site and try again."
      : result.outcome === "CLEARLY_REMOTE"
        ? "Attendance can only be recorded at the venue. If you are physically present, you can ask for a manual review."
        : "Try again from the venue, or request a manual review if you are physically present.";
  return <CheckInState title={result.outcome === "LOCATION_UNCERTAIN" ? "Your attendance needs a quick review" : "We could not confirm your location"} description={locationMessage} tone="warning"><div className="space-y-4 text-left">{manualCase ? <Notice tone="info">A review case is already waiting. The Course Representative or Administrator will see it.</Notice> : result.manualRequestAllowed && result.attemptId ? <><TextArea label="Why were you physically present?" name="manual-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: I am at the venue but my location signal is unavailable." /><Button onClick={requestManual} disabled={requesting || reason.trim().length < 3}>{requesting ? "Requesting…" : "Request manual verification"}</Button></> : null}<Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button></div></CheckInState>;
}

type CheckInResultState = import("../lib/types").CheckInResult | null;

function CheckInState({ title, description, children, tone = "info", loading = false }: { title: string; description: string; children?: React.ReactNode; tone?: "info" | "success" | "warning" | "error"; loading?: boolean }) {
  return <main className="flex min-h-[70vh] items-center justify-center px-4 py-8"><div className="w-full max-w-md rounded-2xl border border-border bg-white p-7 text-center shadow-card">{loading ? <div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-blue-100" aria-hidden="true" /> : <div className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-xl ${tone === "success" ? "bg-emerald-50 text-success" : tone === "warning" ? "bg-amber-50 text-warning" : tone === "error" ? "bg-red-50 text-danger" : "bg-pale text-primary"}`} aria-hidden="true">{tone === "success" ? "✓" : tone === "error" ? "!" : "i"}</div>}<h1 className="mt-5 text-2xl font-bold text-ink">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p><div className="mt-6 flex flex-col items-center gap-3">{children ?? <TextLink href="/home">Back to home</TextLink>}</div></div></main>;
}
