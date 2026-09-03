"use client";

import { Protected, useAuth } from "../../components/app-shell";
import { ParticipantProfile } from "../../components/participant-pages";
import { LoadingBlock } from "../../components/ui";
function ProfileContent() { const { user } = useAuth(); return user ? <ParticipantProfile initialUser={user} /> : <LoadingBlock />; }
export default function ProfilePage() { return <Protected roles={["PARTICIPANT"]}><ProfileContent /></Protected>; }
