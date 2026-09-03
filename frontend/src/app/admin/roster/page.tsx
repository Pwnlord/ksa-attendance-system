"use client";

import { Protected } from "../../../components/app-shell";
import { AdminRoster } from "../../../components/admin-pages";

export default function AdminRosterPage() {
  return <Protected roles={["ADMIN"]}><AdminRoster /></Protected>;
}
