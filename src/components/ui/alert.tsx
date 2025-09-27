import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type AlertTone = "neutral" | "info" | "success" | "warning" | "danger";

const baseClasses =
  "relative w-full overflow-hidden rounded-lg border bg-[var(--alert-bg,var(--surface-muted))] px-5 py-4 pl-6 text-[var(--alert-fg,var(--color-fg))] shadow-xs transition duration-200 ease-emphasized-out before:absolute before:inset-y-3 before:left-2 before:w-1.5 before:rounded-full before:bg-[var(--alert-accent,var(--color-brand))]";

const toneStyles: Record<AlertTone, CSSProperties> = {
  neutral: {
    "--alert-bg": "var(--surface-muted)",
    "--alert-border": "color-mix(in srgb, var(--color-border) 70%, transparent)",
    "--alert-fg": "var(--color-fg)",
    "--alert-accent": "var(--color-brand)",
  },
  info: {
    "--alert-bg": "color-mix(in srgb, var(--color-info) 15%, var(--surface-overlay))",
    "--alert-border": "color-mix(in srgb, var(--color-info) 35%, transparent)",
    "--alert-fg": "var(--color-info)",
    "--alert-accent": "var(--color-info)",
  },
  success: {
    "--alert-bg": "color-mix(in srgb, var(--color-success) 15%, var(--surface-overlay))",
    "--alert-border": "color-mix(in srgb, var(--color-success) 35%, transparent)",
    "--alert-fg": "var(--color-success)",
    "--alert-accent": "var(--color-success)",
  },
  warning: {
    "--alert-bg": "color-mix(in srgb, var(--color-warning) 18%, var(--surface-overlay))",
    "--alert-border": "color-mix(in srgb, var(--color-warning) 40%, transparent)",
    "--alert-fg": "var(--color-warning)",
    "--alert-accent": "var(--color-warning)",
  },
  danger: {
    "--alert-bg": "color-mix(in srgb, var(--color-danger) 18%, var(--surface-overlay))",
    "--alert-border": "color-mix(in srgb, var(--color-danger) 42%, transparent)",
    "--alert-fg": "var(--color-danger)",
    "--alert-accent": "var(--color-danger)",
  },
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ tone = "neutral", className, style, role = "alert", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(baseClasses, "border-[var(--alert-border,var(--color-border))]", className)}
      style={{ ...toneStyles[tone], ...style }}
      role={role}
      {...props}
    />
  ),
);

Alert.displayName = "Alert";

export type AlertTitleProps = HTMLAttributes<HTMLParagraphElement>;

export const AlertTitle = forwardRef<HTMLParagraphElement, AlertTitleProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        "text-[color-mix(in srgb, var(--alert-fg,var(--color-fg)) 85%, var(--color-fg) 15%)] text-sm leading-6 font-semibold tracking-tight",
        className,
      )}
      {...props}
    />
  ),
);

AlertTitle.displayName = "AlertTitle";

export type AlertDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export const AlertDescription = forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        "text-[color-mix(in srgb, var(--alert-fg,var(--color-fg)) 68%, var(--color-fg-subtle) 32%)] mt-1 text-sm leading-6",
        className,
      )}
      {...props}
    />
  ),
);

AlertDescription.displayName = "AlertDescription";

export type AlertActionsProps = HTMLAttributes<HTMLDivElement>;

export const AlertActions = forwardRef<HTMLDivElement, AlertActionsProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mt-3 flex flex-wrap gap-2", className)} {...props} />
  ),
);

AlertActions.displayName = "AlertActions";

export type { AlertTone };
