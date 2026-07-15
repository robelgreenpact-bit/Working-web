"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type Item = {
  id: string;
  kind: string;
  title?: string;
  activity_line?: string;
  pr_number?: string;
  estimated_cost?: number;
  amount?: number;
  requester_name?: string;
  creator_name?: string;
  tax_registered: boolean;
  tax_reference: string | null;
};

export default function AdminRegistrationsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/registrations")
      .then((res) => res.json())
      .then((data) => {
        setItems([...(data.requests || []), ...(data.payments || [])]);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <Navbar title="Tax Registration Overview" />
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-deep">
          Tax / Books Registration Overview
        </h1>

        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-gray-500">No approved/paid items yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="pb-2">Item</th>
                  <th className="pb-2">From</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Reference</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={`${item.kind}-${item.id}`}
                    className="border-b last:border-0"
                  >
                    <td className="py-2">
                      {item.kind === "request"
                        ? item.title
                        : `PR #${item.pr_number} — ${item.activity_line}`}
                    </td>
                    <td className="py-2">
                      {item.requester_name || item.creator_name || "—"}
                    </td>
                    <td className="py-2">
                      {item.estimated_cost || item.amount} ETB
                    </td>
                    <td className="py-2">
                      {item.tax_registered ? (
                        <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">
                          Registered
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-2">{item.tax_reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
