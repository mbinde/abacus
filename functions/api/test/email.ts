// /api/test/email - Test email sending via Resend
// Only accessible to admins

import type { UserContext } from '../_middleware'

interface Env {
  RESEND_API_KEY: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = (data as { user: UserContext }).user

  // Only allow admins
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin only' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get user's email from request or use a test
  const body = await context.request.json().catch(() => ({})) as { to?: string }
  const to = body.to || 'delivered@resend.dev' // Resend's test address

  console.log('[test/email] Sending test email to:', to)
  console.log('[test/email] RESEND_API_KEY exists:', !!env.RESEND_API_KEY)
  console.log('[test/email] RESEND_API_KEY length:', env.RESEND_API_KEY?.length)

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Abacus <notifications@abacus.motleywoods.dev>',
        to: [to],
        subject: 'Abacus Test Email',
        html: `
          <h1>Test Email from Abacus</h1>
          <p>If you received this, email notifications are working!</p>
          <p>Sent at: ${new Date().toISOString()}</p>
          <p>Triggered by: @${user.github_login}</p>
        `,
      }),
    })

    const responseText = await res.text()
    console.log('[test/email] Resend response status:', res.status)
    console.log('[test/email] Resend response body:', responseText)

    if (res.ok) {
      return new Response(JSON.stringify({
        success: true,
        message: `Test email sent to ${to}`,
        resend_response: JSON.parse(responseText)
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Resend API error',
        status: res.status,
        details: responseText
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (err) {
    console.error('[test/email] Exception:', err)
    return new Response(JSON.stringify({
      success: false,
      error: 'Exception sending email',
      details: String(err)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
