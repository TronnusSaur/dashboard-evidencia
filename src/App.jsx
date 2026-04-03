import { GoogleOAuthProvider } from '@react-oauth/google';
import PhotoEvidenceDashboard from './components/PhotoEvidenceDashboard'

const CLIENT_ID = '112055607744-l81vanbaqb1c9maa0c00h6tiu0f3afcu.apps.googleusercontent.com';

function App() {
    return (
        <GoogleOAuthProvider clientId={CLIENT_ID}>
            <div className="min-h-screen">
                <PhotoEvidenceDashboard />
            </div>
        </GoogleOAuthProvider>
    )
}

export default App
