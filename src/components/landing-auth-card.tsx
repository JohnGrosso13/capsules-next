"use client";

import Link from "next/link";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

import styles from "./landing-auth-card.module.css";

export function LandingAuthCard() {
  return (
    <div className={styles.card}>
      <SignedOut>
        <div>
          <h3 className={styles.heading}>Start your space</h3>
          <p className={styles.description}>
            Sign in to launch your Capsule and explore features with our AI prompter.
          </p>
        </div>
        <div className={styles.buttonGroup}>
          <SignInButton mode="modal">
            <button className={styles.primaryButton} type="button">
              Launch Capsule
            </button>
          </SignInButton>
          <SignInButton mode="modal">
            <button className={styles.secondaryButton} type="button">
              Sign In
            </button>
          </SignInButton>
          <SignInButton mode="modal">
            <button className={styles.secondaryButton} type="button">
              Explore Features
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
