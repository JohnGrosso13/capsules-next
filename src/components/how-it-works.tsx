"use client";

import * as React from "react";
import { UserCircle, MagicWand, ShareNetwork, CaretRight } from "@phosphor-icons/react/dist/ssr";

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
      <div className="flex flex-col items-center justify-center gap-8 md:flex-row md:justify-between md:gap-10">
        {list.map((step, index) => (
          <React.Fragment key={step.title}>
            <div className="flex max-w-[320px] flex-col items-center text-center">
              <div className="icon-tile mb-4 grid h-16 w-16 place-items-center rounded-2xl md:h-20 md:w-20">
                {React.isValidElement(step.icon) ? step.icon : DEFAULT_ICONS[index] ?? null}
              </div>
              <div className="mb-1 flex items-center justify-center gap-2">
                <span className="number-badge">{index + 1}</span>
                <h3 className="text-fg text-base font-semibold md:text-lg">{step.title}</h3>
              </div>
              <p className="text-fg-subtle text-xs leading-5 md:text-sm md:leading-6">{step.desc}</p>
            </div>
            {index < list.length - 1 ? (
              <div className="hidden items-center justify-center md:flex" aria-hidden>
                <CaretRight weight="duotone" className="text-fg-subtle/80" size={22} />
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
