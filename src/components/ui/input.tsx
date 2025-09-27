import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type InputVariant = "default" | "subtle" | "underline";
type InputSize = "sm" | "md" | "lg" | "xl";
type InputTone = "default" | "brand" | "danger" | "success";

const baseClasses =
  "flex w-full rounded-md border border-border bg-surface-elevated text-sm text-fg shadow-xs transition duration-200 ease-emphasized-out placeholder:text-fg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60";

const variantClasses: Record<InputVariant, string> = {
  default: "",
  subtle: "border-transparent bg-surface-muted focus-visible:border-brand focus-visible:ring-brand",
  underline:
    "rounded-none border-0 border-b border-border bg-transparent px-0 shadow-none focus-visible:border-brand focus-visible:ring-0 focus-visible:ring-offset-0",
};

const sizeClasses: Record<InputSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-3.5 py-2.5 text-sm",
  lg: "px-4 py-3 text-base",
  xl: "px-5 py-3.5 text-lg",
};

const toneClasses: Record<InputTone, string> = {
  default: "",
  brand: "border-brand/60 focus-visible:ring-brand",
  danger: "border-danger/60 text-danger focus-visible:ring-danger placeholder:text-danger/60",
  success: "border-success/60 focus-visible:ring-success",
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  size?: InputSize;
  tone?: InputTone;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { variant = "default", size = "md", tone = "default", className, type = "text", ...props },
    ref,
  ) => (
    <input
      ref={ref}
      className={cn(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        toneClasses[tone],
        className,
      )}
      type={type}
      {...props}
    />
  ),
);

Input.displayName = "Input";

export type { InputVariant, InputSize, InputTone };
