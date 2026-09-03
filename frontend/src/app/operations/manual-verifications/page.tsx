"use client";

import { Protected } from "../../../components/app-shell";
import { QueueOverview } from "../../../components/operator-pages";

export default function OperationsQueuesPage() {
  return <Protected roles={["COURSE_REP", "ADMIN"]}><QueueOverview /></Protected>;
}
