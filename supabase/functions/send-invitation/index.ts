/**
 * send-invitation — Supabase Edge Function
 *
 * Sends a trainer-to-athlete invitation email via the Resend API.
 * Called from the web inviteAthlete Server Action after the DB row is inserted.
 *
 * The calling Server Action has already verified trainer identity and created
 * the relationship row, so this function trusts the payload and only handles
 * email delivery.
 *
 * ADR-016: No @fitsync/* imports — Edge Functions run in Deno, not Node.
 *
 * Environment:
 *   RESEND_API_KEY — Supabase secret. Set with:
 *     supabase secrets set RESEND_API_KEY=<key>
 *   For local dev, run `supabase functions serve` with secrets loaded.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

interface RequestBody {
  trainerName: string;
  athleteEmail: string;
  acceptUrl: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not configured');
    return new Response(JSON.stringify({ error: 'Email service not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { trainerName, athleteEmail, acceptUrl } = body;
  if (!trainerName || !athleteEmail || !acceptUrl) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const emailPayload = {
    from: 'FitSync <noreply@fitsync.app>',
    to: [athleteEmail],
    subject: `${trainerName} invited you to FitSync`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a1a1a;">You've been invited to FitSync!</h1>
        <p style="color: #444;">
          <strong>${trainerName}</strong> has invited you to connect on FitSync,
          a professional coaching platform.
        </p>
        <p style="color: #444;">
          Click the button below to accept the invitation and get started.
        </p>
        <a
          href="${acceptUrl}"
          style="
            display: inline-block;
            background-color: #2563eb;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            margin: 16px 0;
          "
        >
          Accept Invitation
        </a>
        <p style="color: #888; font-size: 12px;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `,
  };

  const resendResponse = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error('Resend API error:', errorText);
    return new Response(JSON.stringify({ error: 'Failed to send invitation email' }), {
      status: resendResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = (await resendResponse.json()) as { id: string };
  return new Response(JSON.stringify({ id: result.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
