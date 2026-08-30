export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY || "";
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "";
  const senderName = process.env.BREVO_SENDER_NAME || "Hamaralabs";

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email }],
      subject: "Your Hamaralabs verification code",
      htmlContent: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to send verification email (${res.status}): ${body}`);
  }
}

export async function sendBookingConfirmationEmail(
  email: string,
  booking: { date: string; startTime: string; endTime: string }
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY || "";
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "";
  const senderName = process.env.BREVO_SENDER_NAME || "Hamaralabs";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hamaralabs.com";

  const dateLabel = new Date(booking.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email }],
      subject: "Your Remote Lab booking is confirmed",
      htmlContent: `
        <p>Your Remote Lab Booking is confirmed for <strong>${dateLabel}</strong>, <strong>${booking.startTime}–${booking.endTime} IST</strong>.</p>
        <p>Please <a href="${siteUrl}/login">log in</a> with this email during that time to enter and enjoy your experience.</p>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to send booking confirmation email (${res.status}): ${body}`);
  }
}
