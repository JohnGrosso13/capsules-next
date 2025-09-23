"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

import styles from "./header-auth.module.css";

export function HeaderAuth() {
  return (
    <div className={styles.container}>
      <SignedOut>
        <SignInButton mode="modal">
          <button className={styles.signInButton} type="button">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <div className={styles.userButtonWrapper}>
          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>
    </div>
  );
}
