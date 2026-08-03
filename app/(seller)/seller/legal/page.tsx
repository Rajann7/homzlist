import { LegalIndex } from "@/components/legal/LegalIndex";
import { getLegalIndex } from "@/lib/legal/service";

/** Settings → About → Legal (P12 S3a) on the seller host. */
export const metadata = { title: "Legal" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerLegalIndexPage() {
  return <LegalIndex pages={await getLegalIndex()} />;
}
