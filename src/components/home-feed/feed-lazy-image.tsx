"use client";

import * as React from "react";
import Image from "next/image";

type LazyImageProps = React.ComponentProps<typeof Image>;

export const FeedLazyImage = React.forwardRef<HTMLImageElement, LazyImageProps>(
  ({ loading, alt, ...rest }, ref) => (
    <Image ref={ref} loading={loading ?? "lazy"} alt={alt ?? ""} {...rest} />
  ),
);

FeedLazyImage.displayName = "FeedLazyImage";
