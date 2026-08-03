import { DataDownload } from "@/components/account/DataDownload";

/** P12 S5 — Download your data (DPDP §8). */
export const metadata = { title: "Download your data" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerDataPage() {
  return <DataDownload />;
}
