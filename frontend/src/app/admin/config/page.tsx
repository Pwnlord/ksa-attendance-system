"use client";

import { Protected } from "../../../components/app-shell";
import { AdminCourseConfig } from "../../../components/admin-pages";

export default function AdminConfigPage() {
  return <Protected roles={["ADMIN"]}><AdminCourseConfig /></Protected>;
}
