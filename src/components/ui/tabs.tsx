import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

type TabsOrientation = "horizontal" | "vertical";
type TabsVariant = "pill" | "underline" | "outline";
type TabsSize = "sm" | "md" | "lg";

type TabsContextValue = {
  value: string | null;
  select: (value: string) => void;
  orientation: TabsOrientation;
  variant: TabsVariant;
  size: TabsSize;
  getTabId: (value: string) => string;
  getPanelId: (value: string) => string;
  registerValue: (value: string) => void;
  unregisterValue: (value: string) => void;
  values: string[];
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error(`${component} must be used within <Tabs>`);
  }
  return context;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

const listBaseClasses = "flex items-center gap-1";
const listVariantClasses: Record<TabsVariant, string> = {
  pill: "rounded-full bg-surface-muted/40 p-1 shadow-xs backdrop-blur",
  underline: "border-b border-border/60 pb-1",
  outline: "rounded-lg border border-border/60 bg-surface-muted/40 p-1",
};

const triggerBaseClasses =
  "relative inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-transparent font-medium transition duration-200 ease-emphasized-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const triggerVariantClasses: Record<TabsVariant, string> = {
  pill: "data-[state=active]:bg-brand data-[state=active]:text-brand-foreground hover:bg-surface-muted",
  underline:
    "rounded-none border-b-2 border-transparent px-0 data-[state=active]:border-brand data-[state=active]:text-fg hover:text-fg",
  outline:
    "data-[state=active]:border-brand data-[state=active]:bg-surface-elevated data-[state=active]:shadow-sm hover:border-border",
};

const triggerSizeClasses: Record<TabsSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-3.5 text-sm",
  lg: "h-10 px-4 text-base",
};

const contentBaseClasses =
  "mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
  variant?: TabsVariant;
  size?: TabsSize;
  idPrefix?: string;
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
      orientation = "horizontal",
      variant = "pill",
      size = "md",
      className,
      children,
      idPrefix,
      ...props
    },
    ref,
  ) => {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState<string | null>(defaultValue ?? null);
    const [registeredValues, setRegisteredValues] = useState<string[]>([]);

    const activeValue = (isControlled ? value : internalValue) ?? null;
    const generatedId = useId();
    const reactId = idPrefix ?? generatedId;

    const select = useCallback(
      (val: string) => {
        if (!isControlled) {
          setInternalValue(val);
        }
        onValueChange?.(val);
      },
      [isControlled, onValueChange],
    );

    const registerValue = useCallback((val: string) => {
      setRegisteredValues((current) => (current.includes(val) ? current : [...current, val]));
    }, []);

    const unregisterValue = useCallback((val: string) => {
      setRegisteredValues((current) => current.filter((item) => item !== val));
    }, []);

    useEffect(() => {
      if (!isControlled && internalValue == null && registeredValues.length > 0) {
        const firstValue = registeredValues[0];
        if (typeof firstValue === "string") {
          setInternalValue(firstValue);
        }
      }
    }, [isControlled, internalValue, registeredValues]);

    const getTabId = useCallback((val: string) => `tabs-${reactId}-tab-${slug(val)}`, [reactId]);

    const getPanelId = useCallback(
      (val: string) => `tabs-${reactId}-panel-${slug(val)}`,
      [reactId],
    );

    const contextValue = useMemo<TabsContextValue>(
      () => ({
        value: activeValue,
        select,
        orientation,
        variant,
        size,
        getTabId,
        getPanelId,
        registerValue,
        unregisterValue,
        values: registeredValues,
      }),
      [
        activeValue,
        select,
        orientation,
        variant,
        size,
        getTabId,
        getPanelId,
        registerValue,
        unregisterValue,
        registeredValues,
      ],
    );

    return (
      <TabsContext.Provider value={contextValue}>
        <div
          ref={ref}
          className={cn(
            "flex flex-col",
            orientation === "vertical" && "md:flex-row md:items-start md:gap-10",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);

Tabs.displayName = "Tabs";

export type TabsListProps = HTMLAttributes<HTMLDivElement>;

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, ...props }, ref) => {
    const { orientation, variant } = useTabsContext("TabsList");
    return (
      <div
        ref={ref}
        role="tablist"
        className={cn(
          listBaseClasses,
          listVariantClasses[variant],
          orientation === "vertical" && "flex-col",
          className,
        )}
        aria-orientation={orientation}
        {...props}
      />
    );
  },
);

TabsList.displayName = "TabsList";

export interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value: itemValue, className, type = "button", onClick, onKeyDown, ...props }, ref) => {
    const {
      value,
      select,
      orientation,
      size,
      variant,
      getPanelId,
      getTabId,
      registerValue,
      unregisterValue,
      values,
    } = useTabsContext("TabsTrigger");

    useEffect(() => {
      registerValue(itemValue);
      return () => unregisterValue(itemValue);
    }, [itemValue, registerValue, unregisterValue]);

    const tabId = getTabId(itemValue);
    const panelId = getPanelId(itemValue);
    const isActive = value === itemValue;

    return (
      <button
        ref={ref}
        id={tabId}
        role="tab"
        aria-selected={isActive}
        aria-controls={panelId}
        tabIndex={isActive ? 0 : -1}
        data-state={isActive ? "active" : "inactive"}
        className={cn(
          triggerBaseClasses,
          triggerSizeClasses[size],
          triggerVariantClasses[variant],
          orientation === "vertical" && "w-full",
          className,
        )}
        type={type}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            select(itemValue);
          }
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (!values.length) return;
          if (event.key === "Home") {
            event.preventDefault();
            const firstValue = values[0];
            if (typeof firstValue === "string") {
              select(firstValue);
            }
            return;
          }
          if (event.key === "End") {
            event.preventDefault();
            const lastValue = values[values.length - 1];
            if (typeof lastValue === "string") {
              select(lastValue);
            }
            return;
          }
          const keys =
            orientation === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
          if (!keys.includes(event.key)) {
            return;
          }
          event.preventDefault();
          const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
          const currentIndex = values.indexOf(itemValue);
          const nextIndex =
            currentIndex === -1 ? 0 : (currentIndex + direction + values.length) % values.length;
          const nextValue = values[nextIndex];
          if (typeof nextValue === "string") {
            select(nextValue);
          }
        }}
        {...props}
      />
    );
  },
);

TabsTrigger.displayName = "TabsTrigger";

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value: itemValue, className, children, ...props }, ref) => {
    const { value, getPanelId, getTabId, registerValue, unregisterValue } =
      useTabsContext("TabsContent");

    useEffect(() => {
      registerValue(itemValue);
      return () => unregisterValue(itemValue);
    }, [itemValue, registerValue, unregisterValue]);

    const tabId = getTabId(itemValue);
    const panelId = getPanelId(itemValue);
    const isActive = value === itemValue;

    return (
      <div
        ref={ref}
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId}
        hidden={!isActive}
        data-state={isActive ? "active" : "inactive"}
        className={cn(contentBaseClasses, className)}
        {...props}
      >
        {isActive ? children : null}
      </div>
    );
  },
);

TabsContent.displayName = "TabsContent";

export type { TabsOrientation, TabsVariant, TabsSize };
