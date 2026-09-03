"use client";

import { Protected } from "../../../components/app-shell";
import { ParticipantSearch } from "../../../components/operator-pages";

export default function OperationsParticipantsPage() {
  return <Protected roles={["COURSE_REP", "ADMIN"]}><ParticipantSearch /></Protected>;
}
