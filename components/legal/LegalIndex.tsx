import { AppShell } from "@/components/nav/AppShell";
import { List, Row } from "@/components/help/primitives";
import { LegalHeader } from "./LegalHeader";
import type { IconName } from "@/components/ui/Icon";
import type { LegalIndexRow } from "@/lib/legal/service";

/**
 * P12 S3 — the legal index. Rows, their order and their icons all come from
 * cms_pages, so publishing a new document adds a row here with no code change.
 */
export function LegalIndex({ pages, guest, base = "" }: { pages: LegalIndexRow[]; guest: boolean; base?: string }) {
  return (
    <AppShell header={<LegalHeader title="Legal" guest={guest} fallback={base || "/"} />} showNav={!guest}>
      <List className="mt-1">
        {pages.map((p) => (
          <Row key={p.slug} icon={p.icon as IconName} label={p.title} href={`${base}/legal/${p.slug}`} />
        ))}
      </List>
      <p className="px-4 pb-8 pt-6 text-11 leading-[1.5] text-ink-tertiary">
        The interface may be translated, but the legally binding version of every document above is English.
      </p>
    </AppShell>
  );
}
