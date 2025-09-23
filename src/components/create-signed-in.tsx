"use client";

import React from "react";
import { HomeSignedIn } from "./home-signed-in";

type Props = React.ComponentProps<typeof HomeSignedIn>;

export function CreateSignedIn(props: Props) {
  // By default mirror Home, but this wrapper makes it easy to alter
  // sections for the Create page in the future (e.g., hide feed or rail).
  return <HomeSignedIn {...props} />;
}

