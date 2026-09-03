"use client";

import { Protected } from "../../../components/app-shell";
import { LiveAttendance } from "../../../components/operator-pages";

export default function OperationsAttendancePage() {
  return <Protected roles={["COURSE_REP", "ADMIN"]}><LiveAttendance /></Protected>;
}
