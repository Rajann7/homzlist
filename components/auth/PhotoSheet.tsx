"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * Photo action sheet (P1 S7). Take photo / Choose from gallery / Remove photo
 * (last in error colour). 48px rows, leading icons.
 */
export function PhotoSheet({
  open,
  onClose,
  hasPhoto,
  onTake,
  onChoose,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  hasPhoto: boolean;
  onTake: () => void;
  onChoose: () => void;
  onRemove: () => void;
}) {
  const Row = ({ icon, label, destructive, onClick }: { icon: IconName; label: string; destructive?: boolean; onClick: () => void }) => (
    <button
      onClick={() => {
        onClick();
        onClose();
      }}
      className={cn("flex h-12 w-full items-center gap-3 text-left text-15 active:bg-surface-2", destructive ? "text-error" : "text-ink-primary")}
    >
      <Icon name={icon} size={22} strokeWidth={1.7} />
      {label}
    </button>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Profile photo">
      <div className="flex flex-col">
        <Row icon="camera" label="Take photo" onClick={onTake} />
        <Row icon="image" label="Choose from gallery" onClick={onChoose} />
        {hasPhoto && <Row icon="close" label="Remove photo" destructive onClick={onRemove} />}
      </div>
    </BottomSheet>
  );
}
