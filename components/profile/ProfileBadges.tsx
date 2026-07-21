import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import type { Badges } from "@/lib/profile/client";

/**
 * Inline verification badge row (Doc2 §11): Phone ✓ gray · ID ✓ accent · RERA ✓
 * accent-filled. Only approved levels render. Labels mean "Phone/ID/RERA
 * verified" — NEVER "property verified".
 */
export function ProfileBadges({ badges }: { badges: Badges }) {
  return (
    <span className="inline-flex items-center gap-1">
      {badges.phone && <VerifiedBadge level="phone" />}
      {badges.id && <VerifiedBadge level="id" />}
      {badges.rera && <VerifiedBadge level="rera" />}
    </span>
  );
}
