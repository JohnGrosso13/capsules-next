"use client";

import * as React from "react";

import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
  type AlertTone,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type NotificationAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "outline" | "ghost" | "gradient";
  size?: "xs" | "sm" | "md";
};

export type StudioNotification = {
  tone: AlertTone;
  title: string;
  description: string;
  actions?: NotificationAction[];
};

type StudioNotificationBannerProps = {
  notification: StudioNotification;
  className?: string;
};

export function StudioNotificationBanner({
  notification,
  className,
}: StudioNotificationBannerProps) {
  const { tone, title, description, actions = [] } = notification;

  return (
    <Alert tone={tone} className={cn(className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </div>
      </div>
      {actions.length ? (
        <AlertActions>
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "outline"}
              size={action.size ?? "sm"}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </AlertActions>
      ) : null}
    </Alert>
  );
}
