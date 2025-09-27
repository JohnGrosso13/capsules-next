import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "link" | "gradient";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl" | "icon";

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition duration-200 ease-emphasized-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 data-[loading=true]:cursor-progress";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-foreground shadow-md hover:bg-brand-strong hover:shadow-lg",
  secondary:
    "bg-surface-elevated text-fg shadow-sm border border-border hover:border-border-strong hover:bg-surface-muted",
  outline:
    "border border-border text-fg bg-transparent hover:border-border-strong hover:bg-surface-muted",
  ghost:
    "border border-transparent bg-transparent text-fg hover:border-border hover:bg-surface-muted",
  link: "bg-transparent text-brand px-0 underline underline-offset-4 shadow-none hover:text-brand-foreground focus-visible:ring-0 focus-visible:ring-offset-0",
  gradient:
    "btn-gradient bg-[var(--cta-gradient)] text-[var(--cta-button-text)] border border-transparent rounded-pill",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-8 px-3 text-xs",
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
  xl: "h-12 px-6 text-lg",
  icon: "h-10 w-10 p-0 rounded-pill",
};

const iconWrapper = "inline-flex h-4 w-4 items-center justify-center";
const spinnerCircle = "h-4 w-4 animate-spin rounded-full border-2 border-border/60 border-t-brand";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      className,
      leftIcon,
      rightIcon,
      loading = false,
      children,
      disabled,
      type = "button",
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled ?? false;
    const showSpinner = loading;
    const Component = asChild ? Slot : "button";

    const content = (
      <>
        {(showSpinner || leftIcon) && (
          <span className={cn(iconWrapper, size === "icon" && "mr-0")} aria-hidden="true">
            {showSpinner ? <span className={spinnerCircle} /> : leftIcon}
          </span>
        )}
        {children && (
          <span className={cn("flex items-center", size === "icon" && "sr-only")}>{children}</span>
        )}
        {rightIcon && !showSpinner && size !== "icon" && (
          <span className={iconWrapper} aria-hidden="true">
            {rightIcon}
          </span>
        )}
        {showSpinner && <span className="sr-only">Loading</span>}
      </>
    );

    if (asChild) {
      return (
        <Component
          ref={ref as Ref<HTMLButtonElement>}
          className={cn(baseClasses, sizeClasses[size], variantClasses[variant], className)}
          data-loading={showSpinner ? "true" : undefined}
          {...props}
        >
          {content}
        </Component>
      );
    }

    return (
      <Component
        ref={ref}
        className={cn(baseClasses, sizeClasses[size], variantClasses[variant], className)}
        data-loading={showSpinner ? "true" : undefined}
        aria-busy={showSpinner || undefined}
        disabled={isDisabled || showSpinner}
        type={type}
        {...props}
      >
        {content}
      </Component>
    );
  },
);

Button.displayName = "Button";

export type { ButtonVariant, ButtonSize };
