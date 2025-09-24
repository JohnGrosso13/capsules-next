"use client";

import React from "react";
import { HomeSignedIn } from "./home-signed-in";

type Props = React.ComponentProps<typeof HomeSignedIn>;

export function CapsuleSignedIn(props: Props) {
  // Capsule page: hide promo tiles and feed; keep prompter and rail.
  return <HomeSignedIn {...props} showPromoRow={false} showFeed={false} />;
}
