type Step = {
  title: string;
  desc: string;
  icon?: string;
};

export function HowItWorks({ steps }: { steps: Step[] }) {
  const list = steps.slice(0, 3);

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {list.map((step, index) => (
        <div
          key={step.title}
          className="border-border/50 bg-surface-elevated/80 relative flex h-full flex-col rounded-2xl border p-6 shadow-md backdrop-blur"
        >
          <div className="flex items-center gap-3">
            <span className="rounded-pill border-brand/40 bg-brand/10 text-brand flex h-10 w-10 items-center justify-center border text-base font-semibold">
              {index + 1}
            </span>
            <div className="text-2xl">{step.icon ?? "✨"}</div>
          </div>
          <h3 className="text-fg mt-6 text-lg font-semibold">{step.title}</h3>
          <p className="text-fg-subtle mt-2 text-sm leading-6">{step.desc}</p>
        </div>
      ))}
    </div>
  );
}
