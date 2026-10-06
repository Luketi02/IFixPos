import { GoogleOAuthProvider } from '@react-oauth/google';
import LoginScreen from './pages/auth/LoginScreen';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH2_CLIENT_ID;

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <LoginScreen />
    </GoogleOAuthProvider>
  );
}

export default App;