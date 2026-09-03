"use client";

import { Protected } from "../../../../components/app-shell";
import { ManualVerificationDetail } from "../../../../components/operator-pages";

export default function ManualVerificationDetailPage() {
  return <Protected roles={["COURSE_REP", "ADMIN"]}><ManualVerificationDetail /></Protected>;
}
