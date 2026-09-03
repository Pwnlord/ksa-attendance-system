"use client";

import { Protected } from "../../../components/app-shell";
import { AdminAttendanceCorrections } from "../../../components/admin-pages";

export default function AdminAttendanceCorrectionsPage() {
  return <Protected roles={["ADMIN"]}><AdminAttendanceCorrections /></Protected>;
}
