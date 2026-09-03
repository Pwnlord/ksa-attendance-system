"use client";

import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../../lib/api";
import { AuthFrame } from "../../components/auth-forms";
import { LoadingBlock, Notice, TextLink } from "../../components/ui";

export default function VerifyEmailPage() {
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("error");
      setMessage("This verification link is missing or invalid.");
      return;
    }
    api.confirmEmail(token).then(() => {
      setState("success");
    }).catch((reason: unknown) => {
      setState("error");
      setMessage(apiErrorMessage(reason, "This verification link is invalid or has expired."));
    });
  }, []);

  return <AuthFrame title="Verify your email" description="Email verification helps with account recovery. It does not delay attendance.">{state === "loading" ? <LoadingBlock label="Confirming your email…" /> : state === "success" ? <div className="space-y-5"><Notice tone="success">Your email is verified. You can use it for self-service password recovery.</Notice><TextLink href="/home">Continue to attendance</TextLink></div> : <div className="space-y-5"><Notice tone="error">{message}</Notice><TextLink href="/login">Return to log in</TextLink></div>}</AuthFrame>;
}
