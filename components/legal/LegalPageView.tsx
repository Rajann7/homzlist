import { notFound } from "next/navigation";
import { LegalReader } from "./LegalReader";
import { GrievanceCard } from "./GrievanceCard";
import { getLegalPage, getLegalVersionBody, formatDate } from "@/lib/legal/service";
import { renderBody, tableOfContents } from "@/lib/legal/markdown";
import { siteUrl } from "@/lib/seo/schema";

/**
 * Server half of the legal reader: fetch the document (or an archived version),
 * render the long-form body on the server so it is indexable and works with JS
 * off, and hand the interactive chrome to LegalReader.
 *
 * Shared by the public host (guest chrome, indexable) and the seller host (user
 * chrome), so the two can never drift apart.
 */
export async function LegalPageView({
  slug,
  version,
  guest,
  base = "",
}: {
  slug: string;
  version?: string;
  guest: boolean;
  base?: string;
}) {
  const page = await getLegalPage(slug);
  if (!page) notFound();

  let title = page.title;
  let shownVersion = page.version;
  let effective = page.effectiveDate;
  let body = page.body;
  let updated = page.updatedAt;

  if (version && version !== page.version) {
    const archived = await getLegalVersionBody(slug, version);
    if (!archived) notFound();
    title = archived.title;
    shownVersion = archived.version;
    effective = archived.effectiveDate;
    body = archived.body;
    updated = archived.effectiveDate ?? page.updatedAt;
  }

  const sections = tableOfContents(body);
  const s = page.settings;

  return (
    <LegalReader
      slug={slug}
      title={title}
      version={shownVersion}
      effectiveDateLabel={formatDate(effective)}
      updatedLabel={formatDate(updated)}
      versionCount={page.versionCount}
      sections={sections}
      guest={guest}
      shareUrl={`${siteUrl()}/legal/${slug}`}
      intro={
        page.reader === "grievance" ? (
          <GrievanceCard
            name={s.grievance_name}
            email={s.grievance_email}
            address={s.registered_address}
            phone={s.grievance_phone}
            hours={s.grievance_hours}
            ackHours={s.ack_hours}
            resolutionDays={s.resolution_days}
          />
        ) : undefined
      }
    >
      {renderBody(body, sections)}
    </LegalReader>
  );
}
