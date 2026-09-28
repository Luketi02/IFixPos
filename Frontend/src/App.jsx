import { useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import axios from 'axios';

// Leemos la variable del .env (Vite exige usar import.meta.env)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH2_CLIENT_ID;

function App() {
  const [mensaje, setMensaje] = useState("");

  const handleLoginSuccess = async (credentialResponse) => {
    setMensaje("Token recibido, enviando a la aduana de Django... 🛂");

    try {
      // Le tiramos el token de Google a tu backend por HTTP POST
      const respuesta = await axios.post("http://localhost:8000/api/auth/login/google/", {
        google_token: credentialResponse.credential
      });

      console.log("¡Respuesta oficial del Backend!", respuesta.data);
      setMensaje("¡Acceso Concedido! 🟢 Usuario registrado/logueado en PostgreSQL.");

    } catch (error) {
      console.error("Error en la aduana:", error);
      setMensaje("Error 🔴: El backend rechazó el token o no está encendido.");
    }
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px', fontFamily: 'sans-serif' }}>

        <h2>Acceso al Sistema - IFixPos 🛠️</h2>
        <p style={{ marginBottom: '30px' }}>Por favor, identifícate para continuar</p>

        <GoogleLogin
          onSuccess={handleLoginSuccess}
          onError={() => {
            console.error('El pop-up de Google falló o fue cerrado.');
            setMensaje("Se canceló el inicio de sesión.");
          }}
        />

        {mensaje && (
          <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
            <strong>Estado:</strong> {mensaje}
          </div>
        )}

      </div>
    </GoogleOAuthProvider>
  );
}

export default App;