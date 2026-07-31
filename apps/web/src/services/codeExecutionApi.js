import ENDPOINTS from "./endpoints";

const API_BASE = `${ENDPOINTS.API_BASE_URL}/runs`;

async function checkResponseType(res) {
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("text/html")) {
    throw new Error("Execution engine returned an invalid response (HTML). The service may be under maintenance or redirected.");
  }
}

export async function submitRun({ language, code, stdin = "" }) {
  const token = localStorage.getItem("token");
  const headers = { "content-type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ language, code, stdin })
    });

    await checkResponseType(res);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      throw new Error(`Execution submission failed: ${res.status}. ${errorText.substring(0, 100)}`);
    }
    return await res.json(); // { jobId }
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes("failed to fetch")) {
      throw new Error("Cloud Engine is waking up from sleep (Cold Start). Please wait 30 seconds and try again.");
    }
    throw err;
  }
}

export async function fetchStatus(jobId, { signal } = {}) {
  try {
    // GET /api/runs/:runId now enforces ownership, so an authenticated user
    // must identify themselves or their own run reads back as 404.
    const token = localStorage.getItem("token");
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/${encodeURIComponent(jobId)}`, { headers, signal });

    await checkResponseType(res);

    if (!res.ok) {
       const errorText = await res.text().catch(() => "Unknown error");
       throw new Error(`Status check failed: ${res.status}. ${errorText.substring(0, 100)}`);
    }
    const data = await res.json();
    // Map runId back to jobId for consistency
    return { ...data, jobId: data.runId };
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes("failed to fetch")) {
      throw new Error("Cloud Engine is waking up from sleep (Cold Start). Please wait 30 seconds and try again.");
    }
    throw err;
  }
}

export const TERMINAL_STATUSES = [
  "succeeded", "failed", "cancelled", "compilation_error",
  "runtime_error", "timeout", "memory_limit"
];

// Default ceiling on polling. Previously `while (!done)` had no timeout, no
// abort and no attempt cap: a job stuck in "queued" polled every 500ms forever,
// the caller's await never resolved (so setBusy(false) never ran), and
// navigating away did not stop it.
const DEFAULT_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export async function runAndPoll({ language, code, onUpdate, pollMs = 500, signal, timeoutMs }) {
  const { jobId } = await submitRun({ language, code });
  return pollUntilDone(jobId, { onUpdate, pollMs, signal, timeoutMs });
}

export async function pollUntilDone(
  jobId,
  { onUpdate, pollMs = 500, signal, timeoutMs = DEFAULT_POLL_TIMEOUT_MS } = {}
) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (signal?.aborted) throw new DOMException("Polling aborted", "AbortError");

    const status = await fetchStatus(jobId, { signal });
    onUpdate?.(status);

    if (TERMINAL_STATUSES.includes(status.status)) return status;

    if (Date.now() >= deadline) {
      throw new Error(
        `Execution timed out after ${Math.round(timeoutMs / 1000)}s while the run was still "${status.status}".`
      );
    }

    await sleep(pollMs, signal);
  }
}

export async function fetchHistory() {
  const token = localStorage.getItem("token");
  if (!token) return [];

  const res = await fetch(`${API_BASE}/history`, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  await checkResponseType(res);

  if (!res.ok) {
     if (res.status === 401) return [];
     throw new Error("Failed to fetch history");
  }

  return await res.json();
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Polling aborted", "AbortError"));
        },
        { once: true }
      );
    }
  });
}

