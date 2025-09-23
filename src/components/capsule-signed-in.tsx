"use client";

import React from "react";
import { HomeSignedIn } from "./home-signed-in";

type Props = React.ComponentProps<typeof HomeSignedIn>;

export function CapsuleSignedIn(props: Props) {
  // Mirrors Home. Customize per Capsule needs by toggling flags or composing.
  return <HomeSignedIn {...props} />;
}

