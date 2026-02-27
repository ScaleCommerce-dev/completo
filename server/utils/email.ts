import { createTransport, type Transporter } from 'nodemailer'

let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (!transporter) {
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    transporter = createTransport({
      host: process.env.SMTP_HOST || '127.0.0.1',
      port: Number(process.env.SMTP_PORT) || 1025,
      secure: process.env.SMTP_SECURE === 'true',
      ...(user && pass ? { auth: { user, pass } } : {})
    })
  }
  return transporter
}

export function isEmailEnabled(): boolean {
  return !!process.env.SMTP_HOST
}

// Completo hotdog icon as base64 data URI (white fill for dark backgrounds)
const ICON_DATA_URI = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ffffff" d="m19.1 9.349l-9.74 9.74l.01.01l9.74-9.74Z"/><path fill="#ffffff" d="m20.276 9.119l-.47-.47a3.157 3.157 0 0 0-.03-4.43a3.21 3.21 0 0 0-4.42-.03l-.48-.48a2.3 2.3 0 0 0-3.18 0l-7.98 7.98a2.263 2.263 0 0 0 0 3.18l.48.48a3.145 3.145 0 0 0 .03 4.42a3.1 3.1 0 0 0 2.23.92a3.13 3.13 0 0 0 2.2-.89l.47.47a2.245 2.245 0 0 0 3.18 0l7.97-7.97a2.245 2.245 0 0 0 0-3.18m-15.85 3.27l7.97-7.97a1.243 1.243 0 0 1 1.77 0l.47.47l-9.736 9.74l-.47-.47a1.25 1.25 0 0 1-.004-1.77m3.52 6.7a2.2 2.2 0 0 1-3.02-.03a2.15 2.15 0 0 1-.03-3.01l11.16-11.16a2.16 2.16 0 0 1 1.49-.6a2.155 2.155 0 0 1 1.55 3.65Zm11.63-7.49l-7.98 7.97a1.275 1.275 0 0 1-1.76 0l-.47-.47l-.01-.01l9.74-9.74l.01.01l.47.47a1.27 1.27 0 0 1 0 1.771Z"/><path fill="#ffffff" d="M6.57 17.569a.5.5 0 0 1-.354-.854a4.5 4.5 0 0 1 1.357-.967a3.5 3.5 0 0 0 1.1-.778a3.5 3.5 0 0 0 .779-1.1a5.03 5.03 0 0 1 2.324-2.324a3.5 3.5 0 0 0 1.1-.78a3.5 3.5 0 0 0 .78-1.1a4.5 4.5 0 0 1 .97-1.359a4.5 4.5 0 0 1 1.359-.97a3.5 3.5 0 0 0 1.1-.78a.5.5 0 1 1 .707.707a4.5 4.5 0 0 1-1.36.969a3.5 3.5 0 0 0-1.1.781a3.5 3.5 0 0 0-.781 1.1a4.5 4.5 0 0 1-.969 1.36a4.5 4.5 0 0 1-1.359.969a4.03 4.03 0 0 0-1.874 1.874a4.5 4.5 0 0 1-.967 1.357a4.5 4.5 0 0 1-1.358.968a3.5 3.5 0 0 0-1.1.777a.5.5 0 0 1-.354.15"/></svg>'
).toString('base64')

// Shared font stack
const FONT = '\'Plus Jakarta Sans\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif'
const MONO = '\'JetBrains Mono\',\'SF Mono\',\'Fira Code\',\'Cascadia Code\',Menlo,Consolas,monospace'

function buildEmailHtml(options: {
  preheader: string
  heading: string
  body: string
  ctaUrl: string
  ctaLabel: string
  footnote: string
  baseUrl: string
}): string {
  const { preheader, heading, body, ctaUrl, ctaLabel, footnote, baseUrl } = options
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${heading}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0f0f3;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader (hidden inbox preview text) -->
  <div style="display:none;font-size:1px;color:#f0f0f3;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f0f0f3;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Inner card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;width:100%;background-color:#ffffff;border:1px solid #e4e4e7;">

          <!-- Branded header -->
          <tr>
            <td style="background-color:#4f46e5;padding:32px 40px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Icon -->
                  <td style="vertical-align:middle;padding-right:16px;">
                    <img src="${ICON_DATA_URI}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;" />
                  </td>
                  <!-- Brand text -->
                  <td style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${FONT};font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;line-height:1;">
                          Completo
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:5px;font-family:${MONO};font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#dddcf7;line-height:1.6;">
                          ALL THE TOPPINGS<br />
                          <span style="font-weight:400;color:#9f9dd4;">NONE OF THE MESS</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td style="padding:36px 40px 32px;">
              <!-- Heading -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:${FONT};font-size:22px;font-weight:700;color:#18181b;padding-bottom:16px;line-height:1.3;">
                    ${heading}
                  </td>
                </tr>
              </table>
              <!-- Body text -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:${FONT};font-size:15px;line-height:24px;color:#52525b;padding-bottom:32px;">
                    ${body}
                  </td>
                </tr>
              </table>
              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="background-color:#4f46e5;padding:16px 24px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaUrl}" style="height:52px;v-text-anchor:middle;" arcsize="0%" fillcolor="#4f46e5" strokecolor="#4f46e5" strokeweight="0">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;">${ctaLabel}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${ctaUrl}" target="_blank" style="font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${ctaLabel}</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footnote -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="border-top:1px solid #e4e4e7;padding-top:20px;font-family:${FONT};font-size:13px;line-height:20px;color:#a1a1aa;">
                    ${footnote}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- /Inner card -->

        <!-- Footer -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;width:100%;">
          <tr>
            <td style="padding:24px 40px;text-align:center;font-family:${FONT};font-size:12px;line-height:18px;color:#a1a1aa;">
              Sent by <a href="${baseUrl}" style="color:#6366f1;text-decoration:none;font-weight:600;">Completo</a>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendProjectNotificationEmail(to: string, inviterName: string, projectName: string, projectSlug: string): Promise<void> {
  const baseUrl = process.env.APP_URL || 'http://localhost:3000'
  const projectUrl = `${baseUrl}/projects/${projectSlug}`
  const from = process.env.SMTP_FROM || 'Completo <noreply@completo.local>'

  const html = buildEmailHtml({
    preheader: `${inviterName} just added you to the crew.`,
    heading: 'You\'re on the board!',
    body: `${inviterName} added you to <strong style="color:#4f46e5;">${projectName}</strong>. Everything\'s ready to start: Drap. Drop. Get Stuff Completo.`,
    ctaUrl: projectUrl,
    ctaLabel: `Open ${projectName}`,
    footnote: `You\'re receiving this because ${inviterName} added you to a project on Completo.`,
    baseUrl
  })

  await getTransporter().sendMail({
    from,
    to,
    subject: `You've been added to ${projectName} - Completo`,
    text: `${inviterName} added you to ${projectName}. Open the project: ${projectUrl}`,
    html
  })
}

export async function sendAccountInviteEmail(to: string, inviterName: string, projectName: string, registerUrl: string): Promise<void> {
  const baseUrl = process.env.APP_URL || 'http://localhost:3000'
  const from = process.env.SMTP_FROM || 'Completo <noreply@completo.local>'

  const html = buildEmailHtml({
    preheader: 'Your seat at the table is waiting.',
    heading: 'You\'ve been invited!',
    body: `${inviterName} wants you on <strong style="color:#4f46e5;">${projectName}</strong>. Create your account and you\'ll land right in the project - cards piled high, toppings included.`,
    ctaUrl: registerUrl,
    ctaLabel: 'Create Account &amp; Join',
    footnote: `This invitation expires in 7 days. If you don\'t know ${inviterName}, you can safely ignore this.`,
    baseUrl
  })

  await getTransporter().sendMail({
    from,
    to,
    subject: `${inviterName} invited you to ${projectName} - Completo`,
    text: `${inviterName} invited you to ${projectName}. Create your account: ${registerUrl}\n\nThis invitation expires in 7 days.`,
    html
  })
}

export async function sendAccountSetupEmail(to: string, adminName: string, setupUrl: string): Promise<void> {
  const baseUrl = process.env.APP_URL || 'http://localhost:3000'
  const from = process.env.SMTP_FROM || 'Completo <noreply@completo.local>'

  const html = buildEmailHtml({
    preheader: `${adminName} set you up. Time to make it yours.`,
    heading: 'Welcome to the crew!',
    body: `${adminName} created a Completo account for you. One quick step - set your password and you\'re in: Drag, drop, get stuff Completo.`,
    ctaUrl: setupUrl,
    ctaLabel: 'Set Your Password',
    footnote: 'This link expires in 24 hours. If you didn\'t expect this, you can safely ignore it.',
    baseUrl
  })

  await getTransporter().sendMail({
    from,
    to,
    subject: 'Your Completo account is ready - set your password',
    text: `${adminName} created a Completo account for you. Set your password: ${setupUrl}\n\nThis link expires in 24 hours.`,
    html
  })
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const baseUrl = process.env.APP_URL || 'http://localhost:3000'
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`
  const from = process.env.SMTP_FROM || 'Completo <noreply@completo.local>'

  const html = buildEmailHtml({
    preheader: 'Someone requested a password reset for your account.',
    heading: 'Reset your password',
    body: 'We received a request to reset your password. Click the button below to choose a new one. If you didn\'t request this, you can safely ignore this email &mdash; your password won\'t change.',
    ctaUrl: resetUrl,
    ctaLabel: 'Reset Password',
    footnote: 'This link expires in 1 hour. If you didn\'t request a password reset, no action is needed.',
    baseUrl
  })

  await getTransporter().sendMail({
    from,
    to,
    subject: 'Reset your password - Completo',
    text: `Reset your password by clicking this link:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    html
  })
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const baseUrl = process.env.APP_URL || 'http://localhost:3000'
  const verifyUrl = `${baseUrl}/auth/verify-email?token=${token}`
  const from = process.env.SMTP_FROM || 'Completo <noreply@completo.local>'

  const html = buildEmailHtml({
    preheader: 'You\'re one click away from getting stuff Completo.',
    heading: 'Almost there! Verify your email.',
    body: 'You\'re one click away from getting stuff <strong style="color:#4f46e5;">Completo</strong>. Hit the button below to confirm your email and start with drag, drop, get stuff Completo.',
    ctaUrl: verifyUrl,
    ctaLabel: 'Verify Email &amp; Get Started',
    footnote: 'This link expires in 24 hours. If you didn\'t create an account, you can safely ignore this email.',
    baseUrl
  })

  await getTransporter().sendMail({
    from,
    to,
    subject: 'Verify your email - Completo',
    text: `Click the link to verify your email:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    html
  })
}
