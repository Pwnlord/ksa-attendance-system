"use client";

import { AuthFrame, RegistrationForm } from "../../components/auth-forms";

export default function RegisterPage() {
  return <AuthFrame title="Create your account" description="Anyone can create an Academy attendance account."><RegistrationForm /></AuthFrame>;
}
