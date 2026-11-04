"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type RequestRow = {
  id: string;
  type: string;
  title: string;
  estimated_cost: number;
  fulfillment_status: string;
  status: string;
  created_at: string;
  request_assets: {
    id: string;
    fulfillment_mode: string;
    source: string;
    due_date: string | null;
    asset: {
      asset_tag: string;
      item_name: string | null;
      serial_number: string | null;
    } | null;
  }[];
};

const handleDownload = (requestId: string) => {
  window.open(`/api/requests/${requestId}/download`, "_blank");
};

type LoanItem = {
  id: string;
  status: string;
  due_date: string | null;
  return_condition: string | null;
  asset: {
    asset_tag: string;
    item_name: string | null;
    serial_number: string | null;
  } | null;
};

type LoanRequest = {
  id: string;
  purpose: string;
  due_date: string | null;
  status: string;
  items: LoanItem[];
};

const statusLabels: Record<string, string> = {
  pending_manager: "Pending Manager",
  pending_finance: "Pending Finance",
  approved: "Approved",
  rejected: "Rejected",
};

const typeLabels: Record<string, string> = {
  physical_good: "Physical Good / Equipment",
  electronics: "Electronics",
  travel_expense: "Travel Expense",
  reimbursement: "Reimbursement / Money Refund",
  other_asset: "Perdium for field",
  document_request: "Letter / Document Request",
  per_diem: "Perdium Request",
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
  const [loanRequests, setLoanRequests] = useState<LoanRequest[]>([]);
  const [returnConditions, setReturnConditions] = useState<Record<string, string>>({});
  const [returnNotes, setReturnNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/requests")
      .then((res) => res.json())
      .then((data) => {
        setRequests(data.requests || []);
        setLoading(false);
      });

    fetch("/api/asset-loans")
      .then((res) => res.json())
      .then((data) => setLoanRequests(data.requests || []))
      .catch(() => {});
  }, []);

  const handleRequestReturn = async (loanId: string) => {
    const res = await fetch(`/api/asset-loans/${loanId}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        return_condition: returnConditions[loanId] || "",
        note: returnNotes[loanId] || "",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to request return");
      return;
    }
    fetch("/api/asset-loans")
      .then((r) => r.json())
      .then((d) => setLoanRequests(d.requests || []));
  };

  return (
    <div>
      <Navbar title="Worker Dashboard" />
      <div className="mx-auto max-w-4xl p-8">
        {loanRequests.length > 0 && (
          <div className="mb-6 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
            <h2 className="mb-3 text-lg font-semibold text-brand-deep">Items lent to me</h2>
            <div className="space-y-4">
              {loanRequests.map((request) => (
                <section key={request.id} className="rounded border border-gray-200 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-gray-900">{request.purpose}</p>
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs capitalize text-gray-700">
                      {request.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-gray-500">
                    Expected return: {request.due_date || "No due date set"}
                  </p>
                  <div className="space-y-3">
                    {request.items.map((loan) => (
                      <div key={loan.id} className="rounded border border-gray-100 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {loan.asset?.item_name || "Asset"} ({loan.asset?.asset_tag || "No tag"})
                            {loan.asset?.serial_number ? ` · SN ${loan.asset.serial_number}` : ""}
                          </span>
                          <span className="text-xs capitalize text-gray-500">
                            {loan.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        {loan.status === "return_requested" ? (
                          <p className="mt-2 text-xs text-amber-700">Return awaiting confirmation</p>
                        ) : (loan.status === "issued" || loan.status === "overdue") ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                            <select
                              required
                              aria-label="Return condition"
                              value={returnConditions[loan.id] || ""}
                              onChange={(e) => setReturnConditions({ ...returnConditions, [loan.id]: e.target.value })}
                              className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                            >
                              <option value="">Condition</option>
                              <option value="good">Good</option>
                              <option value="damaged">Damaged</option>
                              <option value="lost">Lost</option>
                            </select>
                            <input
                              type="text"
                              aria-label="Return note"
                              placeholder="Optional return note"
                              value={returnNotes[loan.id] || ""}
                              onChange={(e) => setReturnNotes({ ...returnNotes, [loan.id]: e.target.value })}
                              className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                            />
                            <button
                              onClick={() => handleRequestReturn(loan.id)}
                              disabled={!returnConditions[loan.id]}
                              className="rounded bg-brand-deep px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
                            >
                              Request return
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
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
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2">{r.title}</td>
                    <td className="py-2">
                      {typeLabels[r.type] || (r.type || "").replaceAll("_", " ")}
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
                      {r.fulfillment_status && r.fulfillment_status !== "not_applicable" && (
                        <div className="mt-1 text-xs capitalize text-gray-500">
                          {r.fulfillment_status.replaceAll("_", " ")}
                        </div>
                      )}
                      {r.request_assets?.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                          {r.request_assets.map((assigned) => (
                            <li key={assigned.id}>
                              {assigned.asset?.asset_tag || "Asset"}
                              {assigned.asset?.serial_number ? ` · SN ${assigned.asset.serial_number}` : ""}
                              {assigned.fulfillment_mode === "lend" ? " · Lent" : " · Assigned"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-2">
                      {r.type === "per_diem" ? (
                        <button
                          onClick={() => handleDownload(r.id)}
                          className="rounded bg-brand-deep px-3 py-1 text-xs font-medium text-white transition hover:bg-brand-dark"
                        >
                          Download PDF
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
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