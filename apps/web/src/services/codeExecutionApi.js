const getApiUrl = () => import.meta.env.VITE_API_URL || "http://localhost:8080";

export async function submitRun({ language, code }) {
  const token = localStorage.getItem("flux_token");
  const headers = { "content-type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${getApiUrl()}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ language, code })
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      throw new Error(`Execution submission failed: ${res.status} ${res.statusText}. ${errorText}`);
    }
    return await res.json(); // { jobId }
  } catch (err) {
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      throw new Error("Unable to reach the execution engine. Check VITE_API_URL and network connectivity.");
    }
    throw err;
  }
}

export async function fetchStatus(jobId) {
  const res = await fetch(`${getApiUrl()}/runs/${encodeURIComponent(jobId)}`);
  if (!res.ok) {
     const errorText = await res.text().catch(() => "Unknown error");
     throw new Error(`Status check failed: ${res.status}. ${errorText}`);
  }
  const data = await res.json();
  // Map runId back to jobId for consistency
  return { ...data, jobId: data.runId };
}

export async function runAndPoll({ language, code, onUpdate, pollMs = 500 }) {
  const { jobId } = await submitRun({ language, code });

  let done = false;
  while (!done) {
    const status = await fetchStatus(jobId);
    onUpdate?.(status);
    if (["succeeded", "failed", "cancelled"].includes(status.status)) {
      done = true;
      return status;
    }
    await sleep(pollMs);
  }
}

export async function pollUntilDone(jobId, { onUpdate, pollMs = 500 } = {}) {
  let done = false;
  while (!done) {
    const status = await fetchStatus(jobId);
    onUpdate?.(status);
    if (["succeeded", "failed", "cancelled"].includes(status.status)) {
      done = true;
      return status;
    }
    await sleep(pollMs);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

