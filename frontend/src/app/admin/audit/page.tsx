"use client";

import { Protected } from "../../../components/app-shell";
import { AdminAuditLog } from "../../../components/admin-pages";

export default function AdminAuditPage() {
  return <Protected roles={["ADMIN"]}><AdminAuditLog /></Protected>;
}
