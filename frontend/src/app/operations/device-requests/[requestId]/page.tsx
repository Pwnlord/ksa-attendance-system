"use client";

import { Protected } from "../../../../components/app-shell";
import { DeviceRequestDetail } from "../../../../components/operator-pages";

export default function DeviceRequestDetailPage() {
  return <Protected roles={["COURSE_REP", "ADMIN"]}><DeviceRequestDetail /></Protected>;
}
