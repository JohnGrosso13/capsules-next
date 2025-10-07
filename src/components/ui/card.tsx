import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type CardVariant = "elevated" | "outline" | "soft" | "ghost";

const baseClasses =
  "group/card relative overflow-hidden rounded-xl border border-border bg-surface-elevated text-fg shadow-sm transition duration-300 ease-emphasized-out";

const variantClasses: Record<CardVariant, string> = {
  elevated: "bg-surface-elevated shadow-lg border-border/70",
  outline: "bg-transparent border-border shadow-none",
  soft: "border border-border/40 bg-surface-muted shadow-sm",
  ghost: "border-transparent bg-transparent shadow-none",
};

const interactiveClasses =
  "hover:-translate-y-0.5 hover:shadow-xl focus-within:shadow-xl focus-within:ring-1 focus-within:ring-brand focus-visible:outline-none";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "elevated", interactive = false, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        baseClasses,
        variantClasses[variant],
        interactive && interactiveClasses,
        className,
      )}
      {...props}
    />
  ),
);

Card.displayName = "Card";

export type CardHeaderProps = HTMLAttributes<HTMLDivElement>;

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-2 px-6 pt-6 pb-4", className)} {...props} />
  ),
);

CardHeader.displayName = "CardHeader";

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement>;

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-fg text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  ),
);

CardTitle.displayName = "CardTitle";

export type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-fg-subtle text-sm", className)} {...props} />
  ),
);

CardDescription.displayName = "CardDescription";

export type CardContentProps = HTMLAttributes<HTMLDivElement>;

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-6 pb-6", className)} {...props} />
  ),
);

CardContent.displayName = "CardContent";

export type CardFooterProps = HTMLAttributes<HTMLDivElement>;

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mt-auto flex items-center gap-3 px-6 pb-6", className)}
      {...props}
    />
  ),
);

CardFooter.displayName = "CardFooter";

export type { CardVariant };
