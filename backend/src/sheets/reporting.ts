export type ProjectionStatus = "PRESENT" | "ABSENT" | "N/A" | "PENDING" | "CANCELLED";

export function safeSheetValue(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function sessionTabTitle(attendanceDate: string, occurrence: number): string {
  return occurrence <= 1 ? attendanceDate : `${attendanceDate} (${occurrence})`;
}

export function applicableAttendanceStatus(input: {
  sessionStatus: "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED" | "CANCELLED";
  attendanceDate: string;
  enrollmentEffectiveDate: string;
  rosterStatus: "UNCLAIMED" | "CLAIMED" | "DISABLED";
  recordStatus?: "PRESENT" | "ABSENT" | "NOT_APPLICABLE";
}): ProjectionStatus {
  if (input.sessionStatus === "CANCELLED") return "CANCELLED";
  if (input.rosterStatus === "DISABLED") return "N/A";
  if (input.attendanceDate < input.enrollmentEffectiveDate) return "N/A";
  if (input.recordStatus === "NOT_APPLICABLE") return "N/A";
  if (input.recordStatus === "PRESENT") return "PRESENT";
  if (input.recordStatus === "ABSENT") return "ABSENT";
  return input.sessionStatus === "CLOSED" ? "ABSENT" : "PENDING";
}

export function attendancePercentage(statuses: readonly ProjectionStatus[]): string {
  const present = statuses.filter((status) => status === "PRESENT").length;
  const applicable = statuses.filter(
    (status) => status === "PRESENT" || status === "ABSENT",
  ).length;
  if (applicable === 0) return "N/A";
  const percentage = Math.round((present / applicable) * 10000) / 100;
  return `${Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(2)}%`;
}
