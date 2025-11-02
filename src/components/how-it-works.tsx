"use client";

import * as React from "react";
import { UserCircle, MagicWand, ShareNetwork } from "@phosphor-icons/react/dist/ssr";

type Step = {
  title: string;
  desc: string;
  icon?: React.ReactNode;
};

const DEFAULT_ICONS = [
  <UserCircle key="u" weight="duotone" size={26} />,
  <MagicWand key="m" weight="duotone" size={26} />,
  <ShareNetwork key="s" weight="duotone" size={26} />,
];

export function HowItWorks({ steps }: { steps: Step[] }) {
  const list = steps.slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid grid-cols-1 place-items-center gap-8 md:grid-cols-3 md:gap-10">
        {list.map((step, index) => (
          <div
            key={step.title}
            className="flex w-full max-w-sm flex-col items-center text-center md:max-w-none"
          >
            <div className="icon-tile mb-5 grid h-16 w-16 place-items-center rounded-2xl md:mb-6 md:h-20 md:w-20">
              {React.isValidElement(step.icon) ? step.icon : (DEFAULT_ICONS[index] ?? null)}
            </div>
            <div className="mb-1 flex items-start justify-center gap-2">
              <span className="number-badge mt-0.5">{index + 1}</span>
              <h3 className="text-fg mx-auto max-w-[14rem] text-base font-semibold md:text-lg md:max-w-none">
                {step.title}
              </h3>
            </div>
            <p className="text-fg-subtle mx-auto max-w-[24rem] text-xs leading-5 md:text-sm md:leading-6 md:max-w-none">
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
