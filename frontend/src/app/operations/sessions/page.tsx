"use client";

import { Protected, useAuth } from "../../../components/app-shell";
import { SessionHistory } from "../../../components/operator-pages";
import { LoadingBlock } from "../../../components/ui";

function SessionHistoryContent() {
  const { user } = useAuth();
  return user ? <SessionHistory user={user} /> : <LoadingBlock />;
}

export default function OperationsSessionsPage() {
  return <Protected roles={["COURSE_REP", "ADMIN"]}><SessionHistoryContent /></Protected>;
}
