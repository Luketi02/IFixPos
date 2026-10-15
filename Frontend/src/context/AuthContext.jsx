import { useState } from 'react';
import { AuthContext } from './AuthContextDefinition';

const getInitialSession = () => {
  try {
    const storedToken = localStorage.getItem('access_token') || localStorage.getItem('token') || null;
    const storedUser = localStorage.getItem('user');
    const parsedUser = storedUser ? JSON.parse(storedUser) : null;

    if (storedToken && parsedUser) {
      return { token: storedToken, user: parsedUser };
    }
  } catch (e) {
    console.error('Sesión corrupta en localStorage:', e);
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('token');
  }
  return { token: null, user: null };
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(getInitialSession);

  const token = session.token;
  const user = session.user;
  const loading = false;

  const isAuthenticated = Boolean(token && user);

  // Perfil completo si tiene el flag en true o si posee DNI y Teléfono no vacíos
  const isProfileComplete = Boolean(
    user && (
      user.perfil_completo === true ||
      (
        user.dni &&
        String(user.dni).trim() !== '' &&
        user.telefono &&
        String(user.telefono).trim() !== ''
      )
    )
  );

  const login = (tokens, userData) => {
    const accessToken = typeof tokens === 'string' ? tokens : (tokens?.access || tokens?.access_token);
    const refreshToken = tokens?.refresh || tokens?.refresh_token;

    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('token', accessToken);
    }

    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }

    const completo = userData.perfil_completo !== undefined
      ? Boolean(userData.perfil_completo)
      : Boolean(userData.dni && String(userData.dni).trim() !== '' && userData.telefono && String(userData.telefono).trim() !== '');

    const enrichedUser = {
      ...userData,
      perfil_completo: completo
    };

    localStorage.setItem('user', JSON.stringify(enrichedUser));
    setSession({
      token: accessToken || session.token,
      user: enrichedUser
    });
  };

  const updateUser = (newUserData) => {
    setSession((prev) => {
      const updatedUser = {
        ...(prev.user || {}),
        ...newUserData
      };
      
      const completo = updatedUser.perfil_completo !== undefined
        ? Boolean(updatedUser.perfil_completo)
        : Boolean(
            updatedUser.dni && 
            String(updatedUser.dni).trim() !== '' && 
            updatedUser.telefono && 
            String(updatedUser.telefono).trim() !== ''
          );
      
      updatedUser.perfil_completo = completo;
      localStorage.setItem('user', JSON.stringify(updatedUser));

      return {
        ...prev,
        user: updatedUser
      };
    });
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setSession({ token: null, user: null });
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated,
        isProfileComplete,
        loading,
        login,
        updateUser,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
