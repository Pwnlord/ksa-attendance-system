"use client";

import { Protected, useAuth } from "../../components/app-shell";
import { OperationsOverview } from "../../components/operator-pages";
import { LoadingBlock } from "../../components/ui";

function OperationsContent() {
  const { user } = useAuth();
  return user ? <OperationsOverview user={user} /> : <LoadingBlock />;
}

export default function OperationsPage() {
  return <Protected roles={["COURSE_REP", "ADMIN"]}><OperationsContent /></Protected>;
}
