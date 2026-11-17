import { useState, useEffect } from 'react';
import { AuthContext } from './AuthContextDefinition';
import { EVENTO_CUENTA_CAMBIADA, EVENTO_TOKEN_RENOVADO } from '../utils/sesionExpirada';

const getInitialSession = () => {
  try {
    // Unificación de clave a 'access_token' (Fase 1 - F3)
    let storedToken = localStorage.getItem('access_token');
    if (!storedToken && localStorage.getItem('token')) {
      storedToken = localStorage.getItem('token');
      localStorage.setItem('access_token', storedToken);
      localStorage.removeItem('token');
    }
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

  // Sincronización multi-pestaña para evitar operar con 2 cuentas en el mismo navegador
  useEffect(() => {
    const sincronizarSesionStorage = (e) => {
      // Ignorar cambios que no pertenezcan a las claves de autenticación
      if (e.key && !['access_token', 'token', 'user'].includes(e.key)) {
        return;
      }

      const storedToken = localStorage.getItem('access_token') || localStorage.getItem('token');
      const storedUserStr = localStorage.getItem('user');

      // Caso 1: Cierre de sesión en otra pestaña
      if (!storedToken || !storedUserStr) {
        if (session.token || session.user) {
          setSession({ token: null, user: null });
        }
        return;
      }

      // Caso 2: Cambio de cuenta o inicio de sesión en otra pestaña
      try {
        const storedUser = JSON.parse(storedUserStr);
        if (session.user && storedUser && session.user.id_usuario !== storedUser.id_usuario) {
          // Se detectó cambio de cuenta en otra pestaña
          setSession({ token: storedToken, user: storedUser });
          window.dispatchEvent(new CustomEvent(EVENTO_CUENTA_CAMBIADA, {
            detail: { anterior: session.user, nueva: storedUser }
          }));
        } else if (session.token !== storedToken && storedToken) {
          setSession({ token: storedToken, user: storedUser });
        }
      } catch (err) {
        console.error('Error sincronizando sesión entre pestañas:', err);
      }
    };

    const handleTokenRenovado = (e) => {
      const nuevoAccess = e?.detail?.access || localStorage.getItem('access_token');
      if (nuevoAccess && nuevoAccess !== session.token) {
        setSession((prev) => ({
          ...prev,
          token: nuevoAccess
        }));
      }
    };

    const handleFocus = () => {
      const storedToken = localStorage.getItem('access_token') || localStorage.getItem('token');
      const storedUserStr = localStorage.getItem('user');

      if (!storedToken || !storedUserStr) {
        if (session.token || session.user) {
          setSession({ token: null, user: null });
        }
        return;
      }

      try {
        const storedUser = JSON.parse(storedUserStr);
        if (session.user && storedUser && session.user.id_usuario !== storedUser.id_usuario) {
          setSession({ token: storedToken, user: storedUser });
          window.dispatchEvent(new CustomEvent(EVENTO_CUENTA_CAMBIADA, {
            detail: { anterior: session.user, nueva: storedUser }
          }));
        } else if (storedToken !== session.token) {
          setSession((prev) => ({
            ...prev,
            token: storedToken
          }));
        }
      } catch (err) {
        console.error('Error verificando sesión en focus:', err);
      }
    };

    window.addEventListener('storage', sincronizarSesionStorage);
    window.addEventListener('focus', handleFocus);
    window.addEventListener(EVENTO_TOKEN_RENOVADO, handleTokenRenovado);

    return () => {
      window.removeEventListener('storage', sincronizarSesionStorage);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(EVENTO_TOKEN_RENOVADO, handleTokenRenovado);
    };
  }, [session]);

  const login = (tokens, userData) => {
    const accessToken = typeof tokens === 'string' ? tokens : (tokens?.access || tokens?.access_token);
    const refreshToken = tokens?.refresh || tokens?.refresh_token;

    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
      // Mantener compatibilidad temporal durante la migración sin duplicar fuente de verdad
      localStorage.removeItem('token');
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
