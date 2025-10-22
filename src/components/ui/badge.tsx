import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type BadgeVariant = "solid" | "soft" | "outline";
type BadgeTone = "brand" | "neutral" | "success" | "warning" | "danger" | "info";
type BadgeSize = "sm" | "md" | "lg";

const baseClasses =
  "inline-flex items-center justify-center gap-1 rounded-pill border font-medium uppercase tracking-wide transition duration-200 ease-emphasized-out";

const sizeClasses: Record<BadgeSize, string> = {
  sm: "px-2.5 py-0.5 text-[11px]",
  md: "px-3 py-1 text-xs",
  lg: "px-3.5 py-1.5 text-sm",
};

const toneVariantMap: Record<BadgeTone, Record<BadgeVariant, string>> = {
  brand: {
    solid: "border-transparent bg-brand text-brand-foreground shadow-xs",
    soft: "border border-brand/30 bg-brand-muted text-brand",
    outline: "border border-brand text-brand bg-transparent",
  },
  neutral: {
    solid: "border border-border bg-surface-elevated text-fg",
    soft: "border border-border/50 bg-surface-muted text-fg",
    outline: "border border-border text-fg bg-transparent",
  },
  success: {
    solid: "border-transparent bg-success text-background",
    soft: "border border-success/25 bg-success/15 text-success",
    outline: "border border-success text-success bg-transparent",
  },
  warning: {
    solid: "border-transparent bg-warning text-background",
    soft: "border border-warning/30 bg-warning/20 text-warning",
    outline: "border border-warning text-warning bg-transparent",
  },
  danger: {
    solid: "border-transparent bg-danger text-background",
    soft: "border border-danger/30 bg-danger/15 text-danger",
    outline: "border border-danger text-danger bg-transparent",
  },
  info: {
    solid: "border-transparent bg-info text-background",
    soft: "border border-info/25 bg-info/15 text-info",
    outline: "border border-info text-info bg-transparent",
  },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  tone?: BadgeTone;
  size?: BadgeSize;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "soft", tone = "brand", size = "md", className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(baseClasses, sizeClasses[size], toneVariantMap[tone][variant], className)}
      {...props}
    />
  ),
);

Badge.displayName = "Badge";

export type { BadgeVariant, BadgeTone, BadgeSize };
