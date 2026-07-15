"use client";

import { useState } from "react";
import Navbar from "@/app/components/Navbar";

export default function ReportsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const download = (type: "requests" | "payment-requests", format: string) => {
    const params = new URLSearchParams({ format });
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);
    window.location.href = `/api/reports/${type}?${params.toString()}`;
  };

  return (
    <div>
      <Navbar title="Reports" />
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-deep">
          Download History
        </h1>

        <div className="mb-6 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-brand-deep">
            Filter by Date
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Leave blank to include all records.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-600">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              />
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-brand-deep">
            Regular Requests History
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            All worker/admin/accountant equipment, travel, and other requests.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => download("requests", "xlsx")}
              className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              Download Excel
            </button>
            <button
              onClick={() => download("requests", "docx")}
              className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
            >
              Download Word
            </button>
          </div>
        </div>

        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-brand-deep">
            Payment Requests History
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            All Finance-submitted purchase/payment requests (PRs).
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => download("payment-requests", "xlsx")}
              className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              Download Excel
            </button>
            <button
              onClick={() => download("payment-requests", "docx")}
              className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
            >
              Download Word
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
