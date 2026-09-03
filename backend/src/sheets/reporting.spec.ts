import {
  applicableAttendanceStatus,
  attendancePercentage,
  safeSheetValue,
  sessionTabTitle,
} from "./reporting";
import { sheetsRetryDelaySeconds } from "./sheets-retry";

describe("Sheets reporting rules", () => {
  it("keeps cancelled sessions out of attendance status and denominator", () => {
    expect(
      applicableAttendanceStatus({
        sessionStatus: "CANCELLED",
        attendanceDate: "2026-09-03",
        enrollmentEffectiveDate: "2026-09-01",
        rosterStatus: "CLAIMED",
      }),
    ).toBe("CANCELLED");
    expect(attendancePercentage(["PRESENT", "CANCELLED", "N/A"])).toBe("100%");
  });

  it("marks sessions before enrollment as N/A", () => {
    expect(
      applicableAttendanceStatus({
        sessionStatus: "CLOSED",
        attendanceDate: "2026-09-02",
        enrollmentEffectiveDate: "2026-09-03",
        rosterStatus: "CLAIMED",
      }),
    ).toBe("N/A");
  });

  it("derives closed-session absence and percentage", () => {
    expect(
      applicableAttendanceStatus({
        sessionStatus: "CLOSED",
        attendanceDate: "2026-09-03",
        enrollmentEffectiveDate: "2026-09-01",
        rosterStatus: "CLAIMED",
      }),
    ).toBe("ABSENT");
    expect(attendancePercentage(["PRESENT", "ABSENT", "PENDING"])).toBe("50%");
  });

  it("protects cells from spreadsheet formula injection", () => {
    expect(safeSheetValue('=IMPORTDATA("secret")')).toBe('\'=IMPORTDATA("secret")');
    expect(safeSheetValue("KSA-07")).toBe("KSA-07");
  });

  it("uses unique date titles and the approved retry schedule", () => {
    expect(sessionTabTitle("2026-09-03", 1)).toBe("2026-09-03");
    expect(sessionTabTitle("2026-09-03", 2)).toBe("2026-09-03 (2)");
    expect(sheetsRetryDelaySeconds(1)).toBe(5);
    expect(sheetsRetryDelaySeconds(2)).toBe(60);
    expect(sheetsRetryDelaySeconds(3)).toBe(300);
    expect(sheetsRetryDelaySeconds(4)).toBe(900);
    expect(sheetsRetryDelaySeconds(5, 0)).toBe(1800);
    expect(sheetsRetryDelaySeconds(5, 1)).toBe(3600);
  });
});
