import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import { ThemeStylesGallery } from "@/components/theme-style-carousel";

import styles from "./themes.module.css";

export const metadata: Metadata = {
  title: "All Capsules Themes",
  description: "Explore the full collection of Capsules themes and update your look.",
};

export default function SettingsThemesPage(): JSX.Element {
  return (
    <AppPage showPrompter={true}>
      <div className={styles.root}>
        <ThemeStylesGallery />
      </div>
    </AppPage>
  );
}
