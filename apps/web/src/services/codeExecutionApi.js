const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export async function submitRun({ language, code }) {
  const res = await fetch(`${API_URL}/api/code/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ language, code })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json(); // { jobId }
}

export async function fetchStatus(jobId) {
  const res = await fetch(`${API_URL}/api/code/status/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
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

