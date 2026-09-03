"use client";

import { Protected } from "../../../components/app-shell";
import { AdminPhotoReviews } from "../../../components/admin-pages";

export default function AdminPhotoRequestsPage() {
  return <Protected roles={["ADMIN"]}><AdminPhotoReviews /></Protected>;
}
