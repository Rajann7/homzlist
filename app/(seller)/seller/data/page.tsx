import { DataDownload } from "@/components/account/DataDownload";

/** P12 S5 — Download your data (Settings → Legal → Download your data). */
export const metadata = { title: "Download your data" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerDataPage() {
  return <DataDownload />;
}
