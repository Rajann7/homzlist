import { EmptyState, Wordmark } from "@/components";

/**
 * Global 404 (Doc1 §10 — compass art in final design; neutral here). Also the
 * server response for guessing a draft/hidden/private listing URL (Doc9 §10:
 * 404 for non-authorized, so existence never leaks).
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-column flex-col items-center justify-center gap-4 bg-page px-6">
      <Wordmark className="text-24" />
      <EmptyState
        title="Page not found"
        subtitle="The page you're looking for doesn't exist or has moved."
        cta={{ label: "Go home", href: "/" }}
      />
    </div>
  );
}
