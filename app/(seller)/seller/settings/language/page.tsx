import { Language } from "@/components";

/** P10 S8 — Language. Reached from Settings → Preferences → Language. */
export const metadata = { title: "Language" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerLanguagePage() {
  return <Language />;
}
