/**
 * Safe Email Diagnostic Script
 * Usage: node scripts/testEmail.js recipient@nmims.in
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { sendEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../src/utils/emailService');

async function main() {
  const recipient = process.argv[2];

  console.log('====================================================================');
  console.log(' NMIMS Peer Buddy System — Email Integration Diagnostic');
  console.log('====================================================================');
  console.log('RESEND_API_KEY configured  :', Boolean(process.env.RESEND_API_KEY));
  console.log('SMTP_HOST configured       :', Boolean(process.env.SMTP_HOST));
  console.log('EMAIL_FROM                 :', process.env.EMAIL_FROM || '(auto-default)');
  console.log('FRONTEND_URL               :', process.env.FRONTEND_URL || process.env.CLIENT_URL || '(default)');
  console.log('====================================================================\n');

  if (!recipient) {
    console.log('To send a live test email, run:');
    console.log('  node scripts/testEmail.js <your_email@domain.com>\n');
    console.log('Example: node scripts/testEmail.js test@nmims.in');
    process.exit(0);
  }

  console.log(`Sending diagnostic test email to: ${recipient}...`);
  const result = await sendEmail({
    to: recipient,
    subject: 'NMIMS Peer Buddy — Test Email',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #E5E7EB; border-radius: 8px;">
        <h2 style="color: #E4574C;">NMIMS Peer Buddy — Diagnostic Test</h2>
        <p>This email confirms that your Peer Buddy backend email integration is functioning properly.</p>
        <p>Recipient: <strong>${recipient}</strong></p>
        <p>Timestamp: <strong>${new Date().toISOString()}</strong></p>
      </div>
    `,
    text: `NMIMS Peer Buddy diagnostic test message sent to ${recipient} at ${new Date().toISOString()}`
  });

  if (result.sent) {
    console.log(`\n✓ SUCCESS: Email accepted by ${result.provider} (ID: ${result.id || 'N/A'})!`);
  } else {
    console.log(`\n✗ DELIVERY NOT COMPLETED: ${result.error}`);
  }
}

main().catch(err => {
  console.error('Diagnostic error:', err.message);
  process.exit(1);
});
