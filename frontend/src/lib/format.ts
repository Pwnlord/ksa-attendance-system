import type { Role } from "./types";

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", ...options }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return `${formatDate(value)} at ${formatTime(value)}`;
}

export function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function roleLabel(role: Role): string {
  if (role === "COURSE_REP") return "Course Representative";
  if (role === "ADMIN") return "Administrator";
  return "Participant";
}

export function primaryRoleLabel(roles: Role[]): string {
  if (roles.includes("ADMIN")) return "Administrator";
  if (roles.includes("COURSE_REP")) return "Course Representative";
  return "Participant";
}
