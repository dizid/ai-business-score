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
