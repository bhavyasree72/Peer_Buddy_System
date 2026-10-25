require('dotenv').config({ path: __dirname + '/../.env' });
const { query } = require('../src/database/db');

async function cleanDuplicateMessages() {
  console.log('Checking for duplicate messages in Supabase...');
  const duplicates = await query(`
    SELECT m1.message_id
    FROM messages m1
    JOIN messages m2 ON m1.connection_id = m2.connection_id
                    AND m1.sender_id = m2.sender_id
                    AND m1.body = m2.body
                    AND date_trunc('second', m1.sent_at) = date_trunc('second', m2.sent_at)
                    AND m1.message_id > m2.message_id
  `);

  console.log('Duplicate messages found:', duplicates.rows.length);
  for (const row of duplicates.rows) {
    await query('DELETE FROM messages WHERE message_id = ?', [row.message_id]);
    console.log('Deleted duplicate message ID:', row.message_id);
  }
}

cleanDuplicateMessages().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
