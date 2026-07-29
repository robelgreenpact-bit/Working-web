"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type LeaveRequest = {
  id: string;
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

export default function LeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadRequests = async () => {
    setLoading(true);
    const res = await fetch("/api/leaves");
    const data = await res.json();
    setRequests(data.requests || []);
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    const res = await fetch("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || "Failed to submit leave request");
      return;
    }

    setSuccess("Leave request submitted successfully.");
    setForm({ start_date: "", end_date: "", reason: "" });
    loadRequests();
  };

  return (
    <div>
      <Navbar title="Leave Requests" />
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-brand-deep">Leave Requests</h1>
              <p className="text-sm text-gray-600">
                Request time off and track how many days are being recorded.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? (
              <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
            ) : null}
            {success ? (
              <div className="rounded bg-green-50 p-3 text-sm text-green-700">{success}</div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-600">Start date</label>
                <input
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">End date</label>
                <input
                  type="date"
                  required
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">Reason</label>
              <textarea
                rows={3}
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                placeholder="e.g. Family event, medical leave, or vacation"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-brand-deep px-4 py-2 font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Request Leave"}
            </button>
          </form>
        </div>

        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-brand-deep">Your Leave History</h2>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="text-gray-500">No leave requests yet.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <div key={request.id} className="rounded border border-gray-200 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{request.reason}</p>
                      <p className="text-sm text-gray-600">
                        {formatDate(request.start_date)} to {formatDate(request.end_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700">
                        {request.days_count} day{request.days_count === 1 ? "" : "s"}
                      </span>
                      <span className={`rounded px-2 py-1 text-xs ${statusColors[request.status] || "bg-gray-100 text-gray-800"}`}>
                        {statusLabels[request.status] || request.status}
                      </span>
                    </div>
                  </div>
                  {request.manager_comment ? (
                    <p className="mt-2 text-sm text-gray-600">
                      Manager note: {request.manager_comment}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
