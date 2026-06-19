import { GoogleOAuthProvider } from '@react-oauth/google';
import PhotoEvidenceDashboard from './components/PhotoEvidenceDashboard'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

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
