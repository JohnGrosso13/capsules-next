import styles from "./how-it-works.module.css";

type Step = {
  title: string;
  desc: string;
  icon?: string; // emoji placeholder
};

export function HowItWorks({ steps }: { steps: Step[] }) {
  const list = steps.slice(0, 3);
  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        {list.map((s, i) => (
          <>
            <div className={styles.step} key={s.title}>
              <div className={styles.iconBox} aria-hidden>
                <span className={styles.icon}>{s.icon || "✨"}</span>
              </div>
              <div className={styles.head}>
                <span className={styles.idx}>{i + 1}</span>
                <span className={styles.title}>{s.title}</span>
              </div>
              <p className={styles.desc}>{s.desc}</p>
            </div>
            {i < list.length - 1 ? (
              <div className={styles.arrow} aria-hidden>
                ›
              </div>
            ) : null}
          </>
        ))}
      </div>
    </div>
  );
}

