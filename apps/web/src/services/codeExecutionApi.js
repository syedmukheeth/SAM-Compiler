import ENDPOINTS from "./endpoints";

const API_BASE = `${ENDPOINTS.API_BASE_URL}/runs`;

async function checkResponseType(res) {
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("text/html")) {
    throw new Error("Execution engine returned an invalid response (HTML). The service may be under maintenance or redirected.");
  }
}

export async function submitRun({ language, code }) {
  const token = localStorage.getItem("sam_token");
  const headers = { "content-type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ language, code })
    });
    
    await checkResponseType(res);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      throw new Error(`Execution submission failed: ${res.status}. ${errorText.substring(0, 100)}`);
    }
    return await res.json(); // { jobId }
  } catch (err) {
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      throw new Error("Unable to reach the execution engine. Check network connectivity.");
    }
    throw err;
  }
}

export async function fetchStatus(jobId) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(jobId)}`);
  
  await checkResponseType(res);

  if (!res.ok) {
     const errorText = await res.text().catch(() => "Unknown error");
     throw new Error(`Status check failed: ${res.status}. ${errorText.substring(0, 100)}`);
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

export async function fetchHistory() {
  const token = localStorage.getItem("sam_token");
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

