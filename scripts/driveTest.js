import { google } from 'googleapis';
import fs from 'fs';

async function verifyDrive() {
    console.log("Verificando contenidos de la carpeta 1yLLjLtEYhhG_RnbE4jFDV9q5-sxsys7...");
    const token = fs.readFileSync('token.json', 'utf8');
    const content = fs.readFileSync('client_secret_112055607744-l81vanbaqb1c9maa0c00h6tiu0f3afcu.apps.googleusercontent.com.json', 'utf8');
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
    
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost:3001/oauth2callback");
    oauth2Client.setCredentials(JSON.parse(token));
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    try {
        const res = await drive.files.list({
            q: "'1yLLjLtEYhhG_RnbE4jFDV9q5-sxsys7' in parents and trashed = false",
            fields: "files(id, name, mimeType, owners, webViewLink)"
        });
        
        console.log("Archivos encontrados en la carpeta 010034:");
        res.data.files.forEach(f => {
            console.log(`- ${f.name} (ID: ${f.id}) | Owner: ${f.owners[0].emailAddress}`);
        });
        
        if (res.data.files.length === 0) {
            console.log("La carpeta está VACÍA (según la API).");
        }
    } catch (e) {
        console.error("Error buscando:", e.message);
    }
}

verifyDrive();
