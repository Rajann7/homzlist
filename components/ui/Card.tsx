import { cn } from "@/lib/utils";

/**
 * Card — base shell for the Doc1 card family (PropertyCard, ProjectCard,
 * RequirementCard, etc. built on top in later modules). Level-1 shadow at rest
 * in light mode; border outline in dark mode (Doc1 §1.6). Optional pressable
 * scale for whole-card tappables (Doc1 §5).
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  pressable?: boolean;
  selected?: boolean;
}

export function Card({ pressable, selected, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-12 bg-surface-1 shadow-l1 dark:shadow-none dark:border dark:border-border",
        pressable && "cursor-pointer transition-transform duration-150 ease-out-quart active:scale-[0.98]",
        selected && "border-[1.5px] border-accent",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
