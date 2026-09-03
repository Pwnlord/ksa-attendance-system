"use client";

import { Protected } from "../../components/app-shell";
import { CheckInFlow } from "../../components/participant-pages";
export default function CheckInPage() { return <Protected roles={["PARTICIPANT"]}><CheckInFlow /></Protected>; }
