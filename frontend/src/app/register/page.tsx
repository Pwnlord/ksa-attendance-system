"use client";

import { AuthFrame, RegistrationForm } from "../../components/auth-forms";

export default function RegisterPage() {
  return <AuthFrame title="Create your account" description="Your registration must match the Academy's approved participant roster."><RegistrationForm /></AuthFrame>;
}
