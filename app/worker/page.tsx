"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type RequestRow = {
  id: string;
  type: string;
  title: string;
  estimated_cost: number;
  status: string;
  created_at: string;
};

type BorrowedAsset = {
  id: string;
  asset_tag: string;
  item_name: string | null;
  return_requested: boolean;
};

const statusLabels: Record<string, string> = {
  pending_manager: "Pending Manager",
  pending_finance: "Pending Finance",
  approved: "Approved",
  rejected: "Rejected",
};

const statusColors: Record<string, string> = {
  pending_manager: "bg-amber-100 text-amber-800",
  pending_finance: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function WorkerPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [borrowedAssets, setBorrowedAssets] = useState<BorrowedAsset[]>([]);

  useEffect(() => {
    fetch("/api/requests")
      .then((res) => res.json())
      .then((data) => {
        setRequests(data.requests || []);
        setLoading(false);
      });

    fetch("/api/assets/my-borrowed")
      .then((res) => res.json())
      .then((data) => setBorrowedAssets(data.assets || []))
      .catch(() => {});
  }, []);

  const handleRequestReturn = async (assetId: string) => {
    const res = await fetch(`/api/assets/${assetId}/return-request`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to request return");
      return;
    }
    fetch("/api/assets/my-borrowed")
      .then((r) => r.json())
      .then((d) => setBorrowedAssets(d.assets || []));
  };

  return (
    <div>
      <Navbar title="Worker Dashboard" />
      <div className="mx-auto max-w-4xl p-8">
        {borrowedAssets.length > 0 && (
          <div className="mb-6 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
            <h2 className="mb-3 text-lg font-semibold text-brand-deep">
              Items You&apos;ve Borrowed
            </h2>
            <div className="space-y-2">
              {borrowedAssets.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded border border-gray-200 p-3 text-sm"
                >
                  <span>
                    {a.item_name} ({a.asset_tag})
                  </span>
                  {a.return_requested ? (
                    <span className="text-xs text-amber-700">
                      Return requested — awaiting confirmation
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRequestReturn(a.id)}
                      className="rounded bg-brand-deep px-3 py-1 text-xs font-medium text-white transition hover:bg-brand-dark"
                    >
                      I Returned This
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-deep">My Requests</h1>
          
            <a href="/worker/new-request"
            className="rounded bg-brand-deep px-4 py-2 font-medium text-white transition hover:bg-brand-dark"
          >
            + New Request
          </a>
        </div>

        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="text-gray-500">
              You haven&apos;t submitted any requests yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Cost</th>
                  <th className="pb-2">Date Requested</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2">{r.title}</td>
                    <td className="py-2 capitalize">
                      {(r.type || "").replace("_", " ")}
                    </td>
                    <td className="py-2">{r.estimated_cost}</td>
                    <td className="py-2">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      <span
                        className={`rounded px-2 py-1 text-xs ${
                          statusColors[r.status] || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {statusLabels[r.status] || r.status}
                      </span>
                    </td>
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