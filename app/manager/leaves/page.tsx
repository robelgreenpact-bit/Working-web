"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type LeaveRequest = {
  id: string;
  requester_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  status: string;
  manager_comment: string | null;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function formatDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ManagerLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadRequests = async () => {
    setLoading(true);
    const res = await fetch("/api/manager/leaves");
    const data = await res.json();
    setRequests(data.requests || []);
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleDecision = async (id: string, decision: "approved" | "rejected") => {
    setError("");
    setProcessingId(id);
    const res = await fetch(`/api/manager/leaves/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    setProcessingId(null);

    if (!res.ok) {
      setError(data.error || "Failed to update leave request");
      return;
    }

    loadRequests();
  };

  return (
    <div>
      <Navbar title="Leave Approvals" />
      <div className="mx-auto max-w-6xl p-8">
        <div className="mb-6 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h1 className="text-2xl font-bold text-brand-deep">Leave Approvals</h1>
          <p className="mt-2 text-sm text-gray-600">
            Review leave requests and approve or reject them with the recorded day count.
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="text-gray-500">No leave requests available.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <div key={request.id} className="rounded border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{request.reason}</p>
                      <p className="text-sm text-gray-600">
                        {request.requester_id} • {formatDate(request.start_date)} to {formatDate(request.end_date)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {request.days_count} day{request.days_count === 1 ? "" : "s"} requested
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded px-2 py-1 text-xs ${statusColors[request.status] || "bg-gray-100 text-gray-800"}`}>
                        {statusLabels[request.status] || request.status}
                      </span>
                      {request.status === "pending" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDecision(request.id, "approved")}
                            disabled={processingId === request.id}
                            className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                          >
                            {processingId === request.id ? "Processing..." : "Approve"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision(request.id, "rejected")}
                            disabled={processingId === request.id}
                            className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                          >
                            {processingId === request.id ? "Processing..." : "Reject"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
