"use client";

import { Protected } from "../../../components/app-shell";
import { SessionHistory } from "../../../components/operator-pages";

export default function OperationsSessionsPage() {
  return <Protected roles={["COURSE_REP", "ADMIN"]}><SessionHistory /></Protected>;
}
