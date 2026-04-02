import { google } from 'googleapis';
import fs from 'fs';

async function findUploadedFile() {
    console.log("Buscando el archivo 010034_FINAL.jpg en todo el Drive del usuario...");
    const token = fs.readFileSync('token.json', 'utf8');
    const content = fs.readFileSync('client_secret_112055607744-l81vanbaqb1c9maa0c00h6tiu0f3afcu.apps.googleusercontent.com.json', 'utf8');
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
    
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost:3001/oauth2callback");
    oauth2Client.setCredentials(JSON.parse(token));
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    try {
        const res = await drive.files.list({
            q: "name contains '010034' and trashed = false",
            fields: "files(id, name, parents, webViewLink)"
        });
        
        fs.writeFileSync('._driveoutput.json', JSON.stringify(res.data.files, null, 2));
        console.log("Results written to ._driveoutput.json");
    } catch (e) {
        console.error("Error buscando:", e.message);
    }
}

findUploadedFile();
