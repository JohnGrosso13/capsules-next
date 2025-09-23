"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

import styles from "./landing-auth-card.module.css";

export function LandingAuthCard() {
  return (
    <div className={styles.card}>
      <SignedOut>
        <div>
          <h3 className={styles.heading}>Start your space</h3>
          <p className={styles.description}>
            Create a Capsule in minutes and let AI keep your community organized and on the same page.
          </p>
        </div>
        <div className={styles.buttonGroup}>
          <SignUpButton mode="modal">
            <button className={styles.primaryButton} type="button">
              Create your space
            </button>
          </SignUpButton>
          <SignInButton mode="modal">
            <button className={styles.secondaryButton} type="button">
              I already have an account
            </button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <div className={styles.signedInHeader}>
          <div className={styles.userButton}>
            <UserButton afterSignOutUrl="/" />
          </div>
          <div className={styles.signedInText}>
            <span className={styles.signedInGreeting}>Welcome back</span>
            <p className={styles.signedInMessage}>
              Jump straight into your capsule or spin up a new one with AI.
            </p>
          </div>
        </div>
        <div className={styles.divider} />
        <div className={styles.signedInActions}>
          <Link href="/capsule" className={`${styles.linkButton} ${styles.primaryLink}`}>
            Open my capsule
          </Link>
          <Link href="/create" className={styles.linkButton}>
            Create something new
          </Link>
        </div>
      </SignedIn>
    </div>
  );
}
