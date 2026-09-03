"use client";

import { Protected } from "../../components/app-shell";
import { ParticipantHistory } from "../../components/participant-pages";
export default function HistoryPage() { return <Protected roles={["PARTICIPANT"]}><ParticipantHistory /></Protected>; }
