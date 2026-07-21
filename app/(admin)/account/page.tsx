import { EmptyState, Wordmark } from "@/components";

/** Admin dashboard placeholder — full panel is Module 11 (P13-14-15). */
export default function AdminHome() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-admin flex-col items-center justify-center gap-4 px-6">
      <Wordmark className="text-24" />
      <EmptyState title="Admin console ready" subtitle="Queues, users, finance, CMS and settings land in Module 11." />
    </div>
  );
}
