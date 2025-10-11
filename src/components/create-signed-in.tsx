"use client";

import * as React from "react";
import { CreateTiles } from "@/components/create-tiles";

export function CreateSignedIn() {
  // Render the tile-based Create experience beneath the global prompter.
  return <CreateTiles />;
}
