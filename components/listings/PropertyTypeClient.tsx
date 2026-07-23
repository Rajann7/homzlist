"use client";

import { useSearchParams } from "next/navigation";
import { PropertyTypePicker } from "./PostType";

/** Reads the `kind` query param for the type picker (P5 S3). */
export function PropertyTypeClient() {
  const kind = useSearchParams().get("kind") === "rent" ? "rent" : "sell";
  return <PropertyTypePicker kind={kind} />;
}
