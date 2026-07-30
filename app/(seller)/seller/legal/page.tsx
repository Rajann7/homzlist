import { LegalIndex } from "@/components/legal/LegalIndex";
import { getLegalIndex } from "@/lib/legal/service";

/** P12 S3 — the legal shelf inside the app (Settings → Legal). User chrome. */
export const metadata = { title: "Legal" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerLegalIndexPage() {
  return <LegalIndex pages={await getLegalIndex()} guest={false} />;
}
