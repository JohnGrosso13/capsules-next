import Link from "next/link";

export const runtime = "nodejs";

export default function NotFound() {
  return (
    <main style={{ padding: "4rem 1rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Page not found</h1>
      <p style={{ color: "var(--text-3, #999)" }}>The page you are looking for does not exist.</p>
      <p style={{ marginTop: "1rem" }}>
        <Link href="/" style={{ textDecoration: "underline" }}>
          Go back home
        </Link>
      </p>
    </main>
  );
}
