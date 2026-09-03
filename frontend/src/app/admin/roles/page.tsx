"use client";

import { Protected } from "../../../components/app-shell";
import { AdminRoles } from "../../../components/admin-pages";

export default function AdminRolesPage() {
  return <Protected roles={["ADMIN"]}><AdminRoles /></Protected>;
}
