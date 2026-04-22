const {google} = require('googleapis');
const fs = require('fs');

async function test() {
  if (!fs.existsSync('service-account.json')) {
    console.error('No service-account.json found');
    return;
  }
  const credentials = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({version: 'v3', auth: await auth.getClient()});
  const folderId = '1EqejY8Bm2c3NvQ0PEOh7DNUEABuJmHMr';
  
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    console.log('✅ Carpetas encontradas:', res.data.files.length);
    res.data.files.slice(0, 5).forEach(f => console.log('- ' + f.name));
  } catch (e) {
    console.error('❌ Error de acceso:', e.message);
  }
}
test();
