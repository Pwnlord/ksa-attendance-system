"use client";

import { AuthFrame, LoginForm } from "../../components/auth-forms";

export default function LoginPage() {
  return <AuthFrame title="Welcome back" description="Sign in to view your attendance or continue to the check-in page."><LoginForm /></AuthFrame>;
}
