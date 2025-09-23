"use client";

import { useEffect, useState } from "react";

type Subscriber = { email: string; status?: string | null; created_at?: string };

export default function AdminPage() {
  const [rows, setRows] = useState<Subscriber[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/subscribers")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
        return r.json();
      })
      .then((data) => {
        if (!mounted) return;
        setRows(Array.isArray(data.subscribers) ? data.subscribers : []);
      })
      .catch((e) => setError(e.message || "Unauthorized"));
    return () => { mounted = false; };
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Admin: Subscribers</h1>
      {error && <p style={{ color: "#f66" }}>{error}</p>}
      {!error && rows.length === 0 && <p>No subscribers.</p>}
      {!error && rows.length > 0 && (
        <table style={{ width: "100%", maxWidth: 800, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 8 }}>Email</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 8 }}>Status</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 8 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={i}>
                <td style={{ padding: 8, borderBottom: "1px solid #333" }}>{s.email}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #333" }}>{s.status || ""}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #333" }}>{s.created_at || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

