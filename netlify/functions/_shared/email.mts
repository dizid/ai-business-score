// Scan-complete email notification — added 2026-08-13 alongside the model
// expansion, which pushed scan wall-clock time from ~30-45s to ~5-8 minutes
// (see run-scan-background.mts's CONCURRENCY_LIMIT comment for why). A live
// user flagged that nobody should have to sit and watch a multi-minute scan
// run in the browser; this is the fix. Uses Resend's plain HTTP API via
// fetch — no SDK dependency, matching aivis-core.mjs's callModel pattern of
// a raw fetch to the provider rather than pulling in a client library.
declare const Netlify: { env: { get(key: string): string | undefined } };

const RESEND_URL = 'https://api.resend.com/emails';

// Best-effort, never throws — a failed notification email should never fail
// or roll back an otherwise-successful scan. Callers fire-and-forget this
// (or await it and ignore/log the result) rather than letting it affect the
// scan's own status.
export async function sendScanCompleteEmail(params: {
  to: string;
  brand: string;
  companyUrl: string;
  status: 'completed' | 'failed';
  score: number | null;
  // Score of the company's most recent PRIOR completed scan, if one exists
  // — turns the notification from a one-off result into a trend signal
  // ("your score changed from X to Y") instead of requiring a visit to the
  // dashboard's progress chart to notice movement. null when there's no
  // prior completed scan to compare against (first scan for this company),
  // not when the current scan itself has no score.
  previousScore?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Netlify.env.get('RESEND_API_KEY');
  const fromEmail = Netlify.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !fromEmail) {
    console.error('sendScanCompleteEmail: RESEND_API_KEY or RESEND_FROM_EMAIL not set, skipping');
    return { ok: false, error: 'Email not configured' };
  }

  // Only meaningful when both this scan and the prior one produced a real
  // number — a null on either side (failed/too-few-calls scan) has nothing
  // to compare, so the change line is omitted rather than guessed at.
  const hasChangeSignal =
    params.status === 'completed' && params.score !== null && params.previousScore != null;
  const delta = hasChangeSignal ? (params.score as number) - (params.previousScore as number) : 0;
  const changeLine = hasChangeSignal
    ? delta === 0
      ? `Your score is unchanged at ${params.score}/100 since your last scan.\n\n`
      : `Your score changed from ${params.previousScore} to ${params.score} (${delta > 0 ? '+' : ''}${delta}) since your last scan.\n\n`
    : '';

  const subject = params.status === 'failed'
    ? `Scan failed: ${params.brand}`
    : params.score === null
      ? `Scan complete: ${params.brand} (no data)`
      : hasChangeSignal && delta !== 0
        ? `${params.brand} score ${delta > 0 ? 'up' : 'down'} to ${params.score}/100`
        : `Scan complete: ${params.brand} scored ${params.score}/100`;

  const bodyText = params.status === 'failed'
    ? `Your AI visibility scan for ${params.brand} failed to complete.\n\nView details: ${params.companyUrl}`
    : `Your AI visibility scan for ${params.brand} is ready.\n\n` +
      (params.score === null
        ? `No usable data came back from this scan — see the raw check details for why.\n\n`
        : `Score: ${params.score}/100\n\n`) +
      changeLine +
      `View the full result: ${params.companyUrl}`;

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        subject,
        text: bodyText,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Score-regression alert — added 2026-08-26 alongside scheduled weekly
// re-scans. Sent IN ADDITION to sendScanCompleteEmail above (not instead of
// it) whenever a scan's score drops by REGRESSION_ALERT_THRESHOLD or more
// from the prior completed scan, regardless of whether the scan that
// triggered it was manual or scheduled — a real regression is worth
// flagging either way. A distinct notification type rather than a third
// status value on sendScanCompleteEmail, matching this file's existing
// "completed"/"failed" shape. Same best-effort, never-throws contract.
export async function sendScoreRegressionEmail(params: {
  to: string;
  brand: string;
  companyUrl: string;
  score: number;
  previousScore: number;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Netlify.env.get('RESEND_API_KEY');
  const fromEmail = Netlify.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !fromEmail) {
    console.error('sendScoreRegressionEmail: RESEND_API_KEY or RESEND_FROM_EMAIL not set, skipping');
    return { ok: false, error: 'Email not configured' };
  }

  const delta = params.previousScore - params.score;
  const bodyText =
    `Heads up — ${params.brand}'s AI visibility score dropped ${delta} points, ` +
    `from ${params.previousScore} to ${params.score}/100.\n\n` +
    `This is a bigger move than normal run-to-run variation, worth a look.\n\n` +
    `View the full result: ${params.companyUrl}`;

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        subject: `⚠️ ${params.brand}'s AI visibility score dropped ${delta} points`,
        text: bodyText,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Ops failure-rate alert — added for docs/improvement-roadmap.md's
// long-open "no aggregate view of scans.failures across users/time" gap
// (priority #7, reliability). Sent by the new ops-failure-digest.mts
// scheduled function ONLY when the last 24h's failure rate crosses a real
// threshold — not a routine daily "all good" email, since this repo's own
// commit history (429s, cascading timeouts) is what this is meant to catch
// faster than a support ping, not something to add inbox noise for.
export async function sendOpsFailureDigestEmail(params: {
  to: string;
  windowHours: number;
  totalScans: number;
  failedScans: number;
  totalCalls: number;
  totalCallFailures: number;
  failuresByProvider: { provider: string; count: number }[];
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Netlify.env.get('RESEND_API_KEY');
  const fromEmail = Netlify.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !fromEmail) {
    console.error('sendOpsFailureDigestEmail: RESEND_API_KEY or RESEND_FROM_EMAIL not set, skipping');
    return { ok: false, error: 'Email not configured' };
  }

  const callFailureRate = params.totalCalls > 0 ? Math.round((params.totalCallFailures / params.totalCalls) * 100) : 0;
  const providerLines = params.failuresByProvider
    .sort((a, b) => b.count - a.count)
    .map((p) => `  - ${p.provider}: ${p.count} failed call(s)`)
    .join('\n');

  const bodyText =
    `Scan reliability check — last ${params.windowHours}h:\n\n` +
    `${params.totalScans} scan(s), ${params.failedScans} failed entirely.\n` +
    `${params.totalCalls} model call(s), ${params.totalCallFailures} failed (${callFailureRate}%).\n\n` +
    (providerLines ? `By provider:\n${providerLines}\n\n` : '') +
    `This crossed the alert threshold — check Netlify function logs (run-scan-background) for the underlying cause.`;

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        subject: `⚠️ Scan failure rate at ${callFailureRate}% over the last ${params.windowHours}h`,
        text: bodyText,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Sent once, right after an anonymous $19 single-scan purchase's webhook
// finishes creating the ownerless company + scan (Milestone 2 of the
// 2026-08-24 monetization plan) — the buyer has no account yet, so this
// email is their only way back into the product until they claim it. Same
// best-effort, never-throws contract as sendScanCompleteEmail above.
export async function sendSingleScanReceiptEmail(params: {
  to: string;
  brand: string;
  statusUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Netlify.env.get('RESEND_API_KEY');
  const fromEmail = Netlify.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !fromEmail) {
    console.error('sendSingleScanReceiptEmail: RESEND_API_KEY or RESEND_FROM_EMAIL not set, skipping');
    return { ok: false, error: 'Email not configured' };
  }

  const bodyText =
    `Thanks for your purchase — your AI visibility scan for ${params.brand} is running now.\n\n` +
    `View it here (no account needed): ${params.statusUrl}\n\n` +
    `Want to keep tracking ${params.brand} over time? Create a free account from that page and this scan is saved to it automatically.`;

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        subject: `Your AI visibility scan for ${params.brand} is on its way`,
        text: bodyText,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
