"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

type Attachment = {
  id: string;
  file_url: string;
  signed_url?: string | null;
};

type RequestRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  quantity: number | null;
  asset_category: string | null;
  requested_item_name?: string | null;
  item_name: string | null;
  electronics_subcategory: string | null;
  estimated_cost: number;
  justification: string | null;
  created_at: string;
  attachments?: Attachment[];
  requester: { name: string; email: string } | null;
};

type HistoryRow = RequestRow & {
  status: string;
  tax_registered?: boolean;
  tax_reference?: string | null;
  approvals?: {
    decision: string;
    comment: string | null;
    role_at_time: string;
    created_at: string;
    approver?: { name: string } | null;
  }[];
};

type AssetChoice = {
  id: string;
  asset_tag: string;
  item_name: string | null;
  category: string | null;
  electronics_subcategory: string | null;
  serial_number: string | null;
  location: string | null;
};

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function itemName(request: RequestRow) {
  return (
    request.requested_item_name?.trim() ||
    request.item_name?.trim() ||
    ""
  );
}

function isEquipment(request: RequestRow) {
  return (
    request.type === "electronics" &&
    ["tablet", "pc"].includes(request.electronics_subcategory || "")
  );
}

function hasUnknownElectronicsType(request: RequestRow) {
  return (
    request.type === "electronics" &&
    !["tablet", "pc", "other"].includes(
      request.electronics_subcategory || "",
    )
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString();
}

function matchingAssets(
  request: RequestRow,
  assets: AssetChoice[],
) {
  const name = normalize(itemName(request));

  if (!isEquipment(request) || !name) return [];

  return assets.filter(
    (asset) =>
      asset.category === "electronics" &&
      asset.electronics_subcategory ===
        request.electronics_subcategory &&
      normalize(asset.item_name) === name,
  );
}

async function readResponse(response: Response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Request failed (${response.status}).`,
    );
  }

  if (!data || typeof data !== "object") {
    throw new Error("The server returned an invalid response.");
  }

  return data;
}

function RequestDetails({ request }: { request: RequestRow }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-gray-700">
        {itemName(request) && (
          <span>
            <strong>Item:</strong> {itemName(request)}
          </span>
        )}

        {request.electronics_subcategory && (
          <span>
            <strong>Type:</strong>{" "}
            {request.electronics_subcategory.toUpperCase()}
          </span>
        )}

        {request.quantity !== null && (
          <span>
            <strong>Quantity:</strong> {request.quantity}
          </span>
        )}

        {!isEquipment(request) && request.estimated_cost > 0 && (
          <span>
            <strong>Estimated cost:</strong>{" "}
            {Number(request.estimated_cost).toLocaleString()} ETB
          </span>
        )}
      </div>

      {request.justification && (
        <div className="rounded-lg bg-blue-50 p-3 text-gray-800">
          <p className="font-medium">Justification</p>
          <p className="mt-1 whitespace-pre-wrap">
            {request.justification}
          </p>
        </div>
      )}

      {request.description && (
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="mb-1 font-medium">
            {request.type === "per_diem"
              ? "Per diem details"
              : "Description"}
          </p>
          <p className="whitespace-pre-wrap break-words text-gray-700">
            {request.type === "per_diem"
              ? request.description.replace(/\*\*/g, "")
              : request.description}
          </p>
        </div>
      )}

      {!!request.attachments?.length && (
        <div>
          <p className="mb-1 font-medium">Attachments</p>
          <ul className="space-y-1">
            {request.attachments.map((attachment) => (
              <li key={attachment.id}>
                {attachment.signed_url ? (
                  <a
                    href={attachment.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-brand-deep underline"
                  >
                    {attachment.file_url.split("/").pop() ||
                      "Attachment"}
                  </a>
                ) : (
                  <span className="text-gray-500">
                    {attachment.file_url.split("/").pop() ||
                      "Attachment"}{" "}
                    — preview unavailable
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {request.type === "per_diem" && (
        <a
          href={`/api/requests/${request.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded bg-amber-600 px-3 py-2 font-medium text-white"
        >
          Download PDF
        </a>
      )}
    </div>
  );
}

export default function FinancePage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [assets, setAssets] = useState<AssetChoice[]>([]);

  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(true);

  const [requestsError, setRequestsError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [assetsError, setAssetsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const [selections, setSelections] = useState<
    Record<string, string[]>
  >({});
  const [searches, setSearches] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [taxChoices, setTaxChoices] = useState<Record<string, boolean>>(
    {},
  );

  const [processing, setProcessing] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setHistoryLoading(true);
    setAssetsLoading(true);
    setRequestsError("");
    setHistoryError("");
    setAssetsError("");
    setSelections({});

    async function loadRequests() {
      try {
        const response = await fetch("/api/finance/requests", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await readResponse(response);

        if (!Array.isArray(data.requests)) {
          throw new Error("Invalid pending requests response.");
        }

        if (active) setRequests(data.requests);
      } catch (error) {
        if (active) {
          setRequests([]);
          setRequestsError(
            error instanceof Error
              ? error.message
              : "Could not load pending requests.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    async function loadHistory() {
      try {
        const response = await fetch("/api/finance/history", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await readResponse(response);

        if (!Array.isArray(data.requests)) {
          throw new Error("Invalid history response.");
        }

        if (active) setHistory(data.requests);
      } catch (error) {
        if (active) {
          setHistory([]);
          setHistoryError(
            error instanceof Error
              ? error.message
              : "Could not load history.",
          );
        }
      } finally {
        if (active) setHistoryLoading(false);
      }
    }

    async function loadAssets() {
      try {
        const response = await fetch("/api/assets/available", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await readResponse(response);

        if (!Array.isArray(data.assets)) {
          throw new Error("Invalid inventory response.");
        }

        const sortedAssets: AssetChoice[] = [...data.assets];
        sortedAssets.sort((a, b) =>
          a.asset_tag.localeCompare(b.asset_tag, undefined, {
            numeric: true,
          }),
        );

        if (active) setAssets(sortedAssets);
      } catch (error) {
        if (active) {
          setAssets([]);
          setAssetsError(
            error instanceof Error
              ? error.message
              : "Could not load available devices.",
          );
        }
      } finally {
        if (active) setAssetsLoading(false);
      }
    }

    void Promise.allSettled([
      loadRequests(),
      loadHistory(),
      loadAssets(),
    ]);

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshVersion]);

  function refresh() {
    setLoading(true);
    setAssetsLoading(true);
    setHistoryLoading(true);
    setSelections({});
    setRefreshVersion((value) => value + 1);
  }

  function toggleAsset(
    requestId: string,
    assetId: string,
    quantity: number,
  ) {
    setSelections((current) => {
      const selected = current[requestId] || [];

      if (selected.includes(assetId)) {
        return {
          ...current,
          [requestId]: selected.filter((id) => id !== assetId),
        };
      }

      if (selected.length >= quantity) return current;

      return {
        ...current,
        [requestId]: [...selected, assetId],
      };
    });
  }

  async function handleDecision(
    request: RequestRow,
    decision: "approved" | "rejected",
  ) {
    if (submitting.current || loading) return;

    setActionError("");
    setNotice("");

    const comment = (comments[request.id] || "").trim();
    const equipment = isEquipment(request);
    const selected = selections[request.id] || [];

    if (decision === "rejected" && !comment) {
      setActionError("Enter a rejection reason for the worker.");
      return;
    }

    if (decision === "approved") {
      if (hasUnknownElectronicsType(request)) {
        setActionError(
          "This electronics request has no valid equipment type. Correct the request before approving it.",
        );
        return;
      }

      if (equipment) {
        const quantity = Number(request.quantity);
        const candidates = matchingAssets(request, assets);
        const availableIds = new Set(
          candidates.map((asset) => asset.id),
        );

        if (
          assetsLoading ||
          assetsError ||
          !itemName(request) ||
          !Number.isSafeInteger(quantity) ||
          quantity < 1 ||
          candidates.length < quantity ||
          selected.length !== quantity ||
          new Set(selected).size !== quantity ||
          selected.some((id) => !availableIds.has(id))
        ) {
          setActionError(
            "Select exactly the requested number of matching available devices before approving.",
          );
          return;
        }
      }
    }

    submitting.current = true;
    setProcessing(request.id);

    try {
      const response = await fetch(
        `/api/finance/requests/${request.id}/decide`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            comment,
            assetIds:
              equipment && decision === "approved" ? selected : [],
            forTaxRegistry: equipment
              ? false
              : Boolean(taxChoices[request.id]),
          }),
        },
      );

      const data = await readResponse(response);

      setRequests((current) =>
        current.filter((row) => row.id !== request.id),
      );

      const message =
        decision === "rejected"
          ? "Request rejected. The worker can see your reason."
          : equipment
            ? "Request approved. The selected devices are now borrowed by the worker."
            : "Request approved.";

      setNotice(
        typeof data.warning === "string"
          ? `${message} ${data.warning}`
          : message,
      );

      refresh();
    } catch (error) {
      setActionError(
        `${
          error instanceof Error
            ? error.message
            : "Could not confirm the decision."
        } The lists are being refreshed. Check the request status before trying again.`,
      );

      // A failed response can occur after a successful server commit.
      // Reload both requests and inventory before allowing another action.
      refresh();
    } finally {
      submitting.current = false;
      setProcessing(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar title="Approvals" />

      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-deep">
              Finance approvals
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Review approved requests and assign available devices.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/assets/borrowed"
              className="rounded border bg-white px-3 py-2 text-brand-deep"
            >
              Borrowed items
            </Link>
            <Link
              href="/assets/inventory"
              className="rounded border bg-white px-3 py-2 text-brand-deep"
            >
              Inventory
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={
                processing !== null ||
                loading ||
                assetsLoading ||
                historyLoading
              }
              className="rounded border bg-white px-3 py-2 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </header>

        {notice && (
          <p
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {notice}
          </p>
        )}

        {actionError && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {actionError}
          </p>
        )}

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Pending final approval
          </h2>

          {loading ? (
            <p className="text-gray-500">Loading requests…</p>
          ) : requestsError ? (
            <p role="alert" className="rounded bg-red-50 p-4 text-red-700">
              {requestsError}
            </p>
          ) : requests.length === 0 ? (
            <p className="rounded-lg border bg-white p-6 text-gray-500">
              No requests waiting for finance approval.
            </p>
          ) : (
            requests.map((request) => {
              const equipment = isEquipment(request);
              const quantity = Number(request.quantity);
              const validQuantity =
                Number.isSafeInteger(quantity) && quantity > 0;
              const candidates = matchingAssets(request, assets);
              const selected = selections[request.id] || [];
              const candidateIds = new Set(
                candidates.map((asset) => asset.id),
              );

              const search = normalize(searches[request.id]);
              const visibleAssets = candidates.filter(
                (asset) =>
                  !search ||
                  [
                    asset.asset_tag,
                    asset.serial_number,
                    asset.location,
                    asset.item_name,
                  ].some((value) => normalize(value).includes(search)),
              );

              const selectionValid =
                validQuantity &&
                selected.length === quantity &&
                new Set(selected).size === quantity &&
                selected.every((id) => candidateIds.has(id));

              const insufficientStock =
                validQuantity && candidates.length < quantity;

              const canApprove =
                processing === null &&
                !hasUnknownElectronicsType(request) &&
                (!equipment ||
                  (!assetsLoading &&
                    !assetsError &&
                    Boolean(itemName(request)) &&
                    !insufficientStock &&
                    selectionValid));

              return (
                <article
                  key={request.id}
                  className="space-y-4 rounded-xl border bg-white p-4 shadow-sm sm:p-6"
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {request.title}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {request.requester?.name || "Unknown worker"}
                        {request.requester?.email
                          ? ` · ${request.requester.email}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs capitalize text-gray-500">
                        {request.type.replaceAll("_", " ")}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">
                      Submitted {formatDate(request.created_at)}
                    </p>
                  </div>

                  <RequestDetails request={request} />

                  {hasUnknownElectronicsType(request) && (
                    <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
                      This older request has no valid equipment type.
                      Correct its type before approving, or reject it
                      with a reason.
                    </p>
                  )}

                  {equipment && (
                    <section className="space-y-3 rounded-lg border bg-gray-50 p-4">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            Select devices from inventory
                          </h4>
                          <p className="text-sm text-gray-600">
                            {itemName(request) || "Item name missing"}
                            {" · "}
                            {request.electronics_subcategory?.toUpperCase()}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-brand-deep">
                          {selected.length} /{" "}
                          {validQuantity ? quantity : "?"} selected
                        </p>
                      </div>

                      {!validQuantity || !itemName(request) ? (
                        <p className="text-sm text-red-700">
                          The request needs a valid item name and
                          positive whole-number quantity before approval.
                        </p>
                      ) : assetsLoading ? (
                        <p className="text-sm text-gray-500">
                          Loading available devices…
                        </p>
                      ) : assetsError ? (
                        <p role="alert" className="text-sm text-red-700">
                          {assetsError} Use Refresh to try again.
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-600">
                            {candidates.length} matching devices available.
                          </p>

                          {insufficientStock && (
                            <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                              Not enough stock: requested {quantity},
                              available {candidates.length}. Leave this
                              request pending, or reject it with a reason.
                            </p>
                          )}

                          <input
                            type="search"
                            value={searches[request.id] || ""}
                            onChange={(event) =>
                              setSearches((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                            placeholder="Search asset code, serial or location"
                            aria-label={`Search available devices for ${request.title}`}
                            className="w-full rounded border bg-white px-3 py-2 text-sm text-gray-900"
                          />

                          <div className="max-h-80 overflow-auto rounded border bg-white">
                            <table className="w-full text-left text-sm">
                              <thead className="sticky top-0 bg-gray-100 text-gray-700">
                                <tr>
                                  <th className="p-3">Select</th>
                                  <th className="p-3">Asset code</th>
                                  <th className="p-3">Serial number</th>
                                  <th className="p-3">Location</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleAssets.map((asset) => {
                                  const checked = selected.includes(asset.id);

                                  return (
                                    <tr
                                      key={asset.id}
                                      className={
                                        checked
                                          ? "border-t bg-blue-50"
                                          : "border-t"
                                      }
                                    >
                                      <td className="p-3">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={
                                            processing !== null ||
                                            insufficientStock ||
                                            (!checked &&
                                              selected.length >= quantity)
                                          }
                                          onChange={() =>
                                            toggleAsset(
                                              request.id,
                                              asset.id,
                                              quantity,
                                            )
                                          }
                                          aria-label={`Select ${asset.asset_tag}`}
                                          className="h-4 w-4"
                                        />
                                      </td>
                                      <td className="p-3 font-medium">
                                        {asset.asset_tag}
                                      </td>
                                      <td className="p-3">
                                        {asset.serial_number || "—"}
                                      </td>
                                      <td className="p-3">
                                        {asset.location || "—"}
                                      </td>
                                    </tr>
                                  );
                                })}

                                {visibleAssets.length === 0 && (
                                  <tr>
                                    <td
                                      colSpan={4}
                                      className="p-4 text-center text-gray-500"
                                    >
                                      {candidates.length === 0
                                        ? "No matching devices available."
                                        : "No devices match your search."}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {selected.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-medium">Selected:</span>
                              {candidates
                                .filter((asset) =>
                                  selected.includes(asset.id),
                                )
                                .map((asset) => (
                                  <span
                                    key={asset.id}
                                    className="rounded bg-blue-100 px-2 py-1 text-blue-900"
                                  >
                                    {asset.asset_tag}
                                  </span>
                                ))}
                              <button
                                type="button"
                                disabled={processing !== null}
                                onClick={() =>
                                  setSelections((current) => ({
                                    ...current,
                                    [request.id]: [],
                                  }))
                                }
                                className="underline disabled:opacity-50"
                              >
                                Clear selection
                              </button>
                            </div>
                          )}

                          <p className="text-xs text-gray-600">
                            Approval immediately records these devices as
                            borrowed by{" "}
                            {request.requester?.name || "the worker"}.
                            There is no due date. Availability is checked
                            again when the approval is saved.
                          </p>
                        </>
                      )}
                    </section>
                  )}

                  {!equipment &&
                    !hasUnknownElectronicsType(request) && (
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={Boolean(taxChoices[request.id])}
                          disabled={processing !== null}
                          onChange={(event) =>
                            setTaxChoices((current) => ({
                              ...current,
                              [request.id]: event.target.checked,
                            }))
                          }
                          className="h-4 w-4"
                        />
                        Send to Tax Registry
                      </label>
                    )}

                  <div>
                    <label
                      htmlFor={`comment-${request.id}`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Comment / rejection reason
                    </label>
                    <textarea
                      id={`comment-${request.id}`}
                      value={comments[request.id] || ""}
                      disabled={processing !== null}
                      onChange={(event) =>
                        setComments((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="Required when rejecting; visible to the worker."
                      rows={3}
                      className="w-full rounded border p-3 text-sm text-gray-900"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        void handleDecision(request, "approved")
                      }
                      disabled={!canApprove}
                      className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {processing === request.id
                        ? "Saving…"
                        : equipment
                          ? "Approve and assign devices"
                          : "Approve"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleDecision(request, "rejected")
                      }
                      disabled={
                        processing !== null ||
                        !(comments[request.id] || "").trim()
                      }
                      className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reject
                    </button>

                    <span className="text-xs text-gray-500">
                      To leave pending, take no action.
                    </span>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <section className="space-y-4 border-t pt-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Decision history
          </h2>

          {historyLoading ? (
            <p className="text-gray-500">Loading history…</p>
          ) : historyError ? (
            <p role="alert" className="rounded bg-red-50 p-4 text-red-700">
              {historyError}
            </p>
          ) : history.length === 0 ? (
            <p className="rounded-lg border bg-white p-6 text-gray-500">
              No history yet.
            </p>
          ) : (
            history.map((request) => (
              <article
                key={request.id}
                className="space-y-3 rounded-xl border bg-white p-4"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{request.title}</h3>
                    <p className="text-sm text-gray-500">
                      {request.requester?.name || "Unknown worker"}
                      {" · "}
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  <span
                    className={`self-start rounded px-2 py-1 text-xs capitalize ${
                      request.status === "rejected"
                        ? "bg-red-100 text-red-800"
                        : request.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {request.status.replaceAll("_", " ")}
                  </span>
                </div>

                <details>
                  <summary className="cursor-pointer text-sm text-brand-deep">
                    View request details
                  </summary>
                  <div className="mt-3">
                    <RequestDetails request={request} />
                  </div>
                </details>

                {!!request.approvals?.length && (
                  <ul className="space-y-2 border-t pt-3 text-sm text-gray-700">
                    {[...(request.approvals || [])]
                      .sort(
                        (a, b) =>
                          new Date(b.created_at).getTime() -
                          new Date(a.created_at).getTime(),
                      )
                      .map((approval, index) => (
                        <li key={`${approval.created_at}-${index}`}>
                          <p>
                            <span className="capitalize">
                              {approval.role_at_time}
                            </span>
                            {" · "}
                            {approval.approver?.name || "Unknown"}
                            {" · "}
                            <strong>{approval.decision}</strong>
                            {" · "}
                            {formatDate(approval.created_at)}
                          </p>
                          {approval.comment && (
                            <p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2">
                              {approval.comment}
                            </p>
                          )}
                        </li>
                      ))}
                  </ul>
                )}

                {isEquipment(request) &&
                  request.status === "approved" && (
                    <Link
                      href="/assets/borrowed"
                      className="inline-block text-sm text-brand-deep underline"
                    >
                      View devices and return status on Borrowed items
                    </Link>
                  )}

                {!isEquipment(request) &&
                  request.status === "approved" && (
                    <p className="text-xs text-gray-600">
                      {request.tax_registered
                        ? `Registered for tax/books${
                            request.tax_reference
                              ? ` · Ref: ${request.tax_reference}`
                              : ""
                          }`
                        : "Not registered for tax/books"}
                    </p>
                  )}
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
}