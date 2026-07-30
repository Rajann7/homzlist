import { AppShell } from "@/components/nav/AppShell";
import { List, Row, Badge } from "@/components/help/primitives";
import { LegalHeader } from "./LegalHeader";
import type { LegalVersion } from "@/lib/legal/service";
import { formatDate } from "@/lib/legal/service";

/**
 * Version history behind the reader's "View previous versions".
 *
 * P12 leaves that link as a prototype toast, so rather than invent a screen this
 * reuses the design's own document-index layout (S3's `.lst` rows over the same
 * appbar) with versions as the rows. Flagged in the module report.
 */
export function LegalVersions({
  slug,
  title,
  versions,
  guest,
  base = "",
}: {
  slug: string;
  title: string;
  versions: LegalVersion[];
  guest: boolean;
  base?: string;
}) {
  return (
    <AppShell
      header={<LegalHeader title={title} guest={guest} fallback={`${base}/legal/${slug}`} />}
      showNav={!guest}
    >
      <p className="px-4 pb-1 pt-4 text-13 text-ink-secondary">
        Every version of this document is dated and archived. The current version applies to your use today; the
        version in effect at the time of a purchase applies to that purchase.
      </p>
      <List className="mt-2">
        {versions.map((v) => (
          <Row key={v.version} href={`${base}/legal/${slug}?version=${encodeURIComponent(v.version)}`}>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-15 text-ink-primary">Version {v.version}</span>
              <span className="truncate text-11 text-ink-tertiary">
                {v.effectiveDate ? `Effective ${formatDate(v.effectiveDate)}` : "No effective date"}
                {v.note ? ` · ${v.note}` : ""}
              </span>
            </span>
            {v.isCurrent && <Badge tone="accent">Current</Badge>}
          </Row>
        ))}
      </List>
    </AppShell>
  );
}
