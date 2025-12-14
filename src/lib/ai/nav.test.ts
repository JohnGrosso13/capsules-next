import { describe, expect, it } from "vitest";

import { resolveNavigationTarget } from "./nav";

describe("resolveNavigationTarget", () => {
  it("navigates to Explore", () => {
    const target = resolveNavigationTarget("go to the explore page");
    expect(target).toEqual({ kind: "route", path: "/explore", label: "Explore" });
  });

  it("navigates to Memory uploads", () => {
    const target = resolveNavigationTarget("show me the memory uploads view");
    expect(target).toEqual({ kind: "route", path: "/memory", label: "Memory" });
  });

  it("navigates to Market", () => {
    const target = resolveNavigationTarget("take me to the market tab");
    expect(target).toEqual({ kind: "route", path: "/market", label: "Market" });
  });

  it("navigates to Friends", () => {
    const target = resolveNavigationTarget("open the friends page");
    expect(target).toEqual({ kind: "route", path: "/friends", label: "Friends" });
  });

  it("navigates to Profile", () => {
    const target = resolveNavigationTarget("bring up my profile page");
    expect(target).toEqual({ kind: "route", path: "/profile/me", label: "Profile" });
  });

  it("navigates to Orders", () => {
    const target = resolveNavigationTarget("orders page please");
    expect(target).toEqual({ kind: "route", path: "/create/mystore/orders", label: "Store orders" });
  });

  it("opens general settings", () => {
    const target = resolveNavigationTarget("open settings");
    expect(target).toEqual({ kind: "route", path: "/settings", label: "Settings" });
  });

  it("opens billing settings tab", () => {
    const target = resolveNavigationTarget("go to billing settings");
    expect(target).toEqual({
      kind: "route",
      path: "/settings?tab=billing",
      label: "Settings \u2013 Billing",
    });
  });

  it("opens notifications settings tab without an explicit nav verb", () => {
    const target = resolveNavigationTarget("notification settings tab");
    expect(target).toEqual({
      kind: "route",
      path: "/settings?tab=notifications",
      label: "Settings \u2013 Notifications",
    });
  });

  it("opens voice settings", () => {
    const target = resolveNavigationTarget("voice settings page");
    expect(target).toEqual({
      kind: "route",
      path: "/settings?tab=voice",
      label: "Settings \u2013 Voice",
    });
  });

  it("opens account settings when profile settings are requested", () => {
    const target = resolveNavigationTarget("open my profile settings page");
    expect(target).toEqual({
      kind: "route",
      path: "/settings?tab=account",
      label: "Settings \u2013 Account",
    });
  });

  it("opens security settings", () => {
    const target = resolveNavigationTarget("take me to security and privacy settings");
    expect(target).toEqual({
      kind: "route",
      path: "/settings?tab=security",
      label: "Settings \u2013 Security",
    });
  });
});
