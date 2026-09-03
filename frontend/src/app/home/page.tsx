"use client";

import { Protected, useAuth } from "../../components/app-shell";
import { ParticipantHome } from "../../components/participant-pages";
import { LoadingBlock } from "../../components/ui";

function HomeContent() { const { user } = useAuth(); return user ? <ParticipantHome user={user} /> : <LoadingBlock />; }
export default function HomePage() { return <Protected roles={["PARTICIPANT"]}><HomeContent /></Protected>; }
