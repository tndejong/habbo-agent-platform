// Mail templates. All functions take a mailer (nodemailer transport) and a
// config object so they remain pure transports — easy to test, easy to mock.

export function createMailer({ mailTransport, PORTAL_SMTP_FROM, PORTAL_PUBLIC_URL, PORTAL_RESET_TOKEN_TTL_MINUTES, PORTAL_ADMIN_EMAIL }) {
  async function sendPasswordResetEmail({ toEmail, username, resetUrl }) {
    if (!mailTransport) {
      console.warn(`Password reset requested for ${toEmail}, but SMTP is not configured. URL: ${resetUrl}`);
      return;
    }
    await mailTransport.sendMail({
      from: PORTAL_SMTP_FROM,
      to: toEmail,
      subject: 'Reset your Agent Hotel Portal password',
      text: [
        `Hi ${username},`,
        '',
        'A password reset was requested for your Agent Hotel Portal account.',
        `Use this link to reset your password (valid for ${PORTAL_RESET_TOKEN_TTL_MINUTES} minutes):`,
        resetUrl,
        '',
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
      html: `
        <p>Hi ${username},</p>
        <p>A password reset was requested for your Agent Hotel Portal account.</p>
        <p>
          Use this link to reset your password (valid for ${PORTAL_RESET_TOKEN_TTL_MINUTES} minutes):<br />
          <a href="${resetUrl}">${resetUrl}</a>
        </p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    });
  }

  async function sendWelcomeEmail({ toEmail, username }) {
    if (!mailTransport) return;
    const loginUrl = `${PORTAL_PUBLIC_URL}/login`;
    await mailTransport.sendMail({
      from: PORTAL_SMTP_FROM,
      to: toEmail,
      subject: 'Welcome to Agent Hotel Portal!',
      text: [
        `Hi ${username},`,
        '',
        'Your Agent Hotel Portal account is ready. You can log in and start exploring:',
        loginUrl,
        '',
        'Your account starts on the Basic tier. You can request a Pro upgrade from inside the portal once you are ready to deploy agent teams.',
        '',
        'See you in the hotel!',
      ].join('\n'),
      html: `
        <p>Hi ${username},</p>
        <p>Your Agent Hotel Portal account is ready. <a href="${loginUrl}">Log in now</a> and start exploring.</p>
        <p>Your account starts on the <strong>Basic</strong> tier. You can request a Pro upgrade from inside the portal once you are ready to deploy agent teams.</p>
        <p>See you in the hotel!</p>
      `,
    });
  }

  async function sendUpgradeRequestNotification({ request, user }) {
    if (!mailTransport || !PORTAL_ADMIN_EMAIL) return;
    const reviewUrl = `${PORTAL_PUBLIC_URL}/app/home`;
    await mailTransport.sendMail({
      from: PORTAL_SMTP_FROM,
      to: PORTAL_ADMIN_EMAIL,
      subject: `[Agent Hotel] Tier upgrade request from ${user.username}`,
      text: [
        `New tier upgrade request`,
        '',
        `User:       ${user.username} (${user.email})`,
        `Requested:  ${request.requested_tier}`,
        `Motivation: ${request.motivation || '(none)'}`,
        '',
        `Review it in the portal: ${reviewUrl}`,
      ].join('\n'),
      html: `
        <p><strong>New tier upgrade request</strong></p>
        <table cellpadding="4">
          <tr><td><strong>User</strong></td><td>${user.username} (${user.email})</td></tr>
          <tr><td><strong>Requested tier</strong></td><td>${request.requested_tier}</td></tr>
          <tr><td><strong>Motivation</strong></td><td>${request.motivation || '<em>none</em>'}</td></tr>
        </table>
        <p><a href="${reviewUrl}">Review in the portal</a></p>
      `,
    });
  }

  async function sendUpgradeDecisionEmail({ toEmail, username, status, requestedTier, adminNote }) {
    if (!mailTransport) return;
    const approved = status === 'approved';
    await mailTransport.sendMail({
      from: PORTAL_SMTP_FROM,
      to: toEmail,
      subject: `Your ${requestedTier} upgrade request was ${approved ? 'approved' : 'denied'}`,
      text: [
        `Hi ${username},`,
        '',
        approved
          ? `Great news — your request to upgrade to ${requestedTier} has been approved! Your account has been updated.`
          : `Your request to upgrade to ${requestedTier} has been denied.`,
        adminNote ? `\nNote from the admin: ${adminNote}` : '',
        '',
        `Log in to the portal: ${PORTAL_PUBLIC_URL}/login`,
      ].join('\n'),
      html: `
        <p>Hi ${username},</p>
        ${approved
          ? `<p>Great news — your request to upgrade to <strong>${requestedTier}</strong> has been <strong>approved</strong>! Your account has been updated.</p>`
          : `<p>Your request to upgrade to <strong>${requestedTier}</strong> has been <strong>denied</strong>.</p>`}
        ${adminNote ? `<p><em>Note from the admin: ${adminNote}</em></p>` : ''}
        <p><a href="${PORTAL_PUBLIC_URL}/login">Log in to the portal</a></p>
      `,
    });
  }

  return {
    sendPasswordResetEmail,
    sendWelcomeEmail,
    sendUpgradeRequestNotification,
    sendUpgradeDecisionEmail,
  };
}
