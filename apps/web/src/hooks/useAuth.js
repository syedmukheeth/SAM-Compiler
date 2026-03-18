import { useState, useEffect, useCallback } from "react";
import { getMe } from "../services/authApi";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("flux_token"));
  const [loading, setLoading] = useState(true);

  const logoutUser = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("flux_user");
    localStorage.removeItem("flux_token");
  }, []);

  const loginUser = useCallback((userData, accessToken) => {
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem("flux_user", JSON.stringify(userData));
    localStorage.setItem("flux_token", accessToken);
  }, []);

  const fetchUser = useCallback(async (authToken) => {
    try {
      const userData = await getMe(authToken);
      setUser(userData);
      localStorage.setItem("flux_user", JSON.stringify(userData));
    } catch (err) {
      console.error("Session verification failed:", err);
      if (err.response?.status === 401) {
        logoutUser();
      }
    } finally {
      setLoading(false);
    }
  }, [logoutUser]);

  useEffect(() => {
    if (token) {
      const savedUser = localStorage.getItem("flux_user");
      if (savedUser) setUser(JSON.parse(savedUser));
      fetchUser(token);
    } else {
      setLoading(false);
    }
  }, [token, fetchUser]);

  return {
    user,
    token,
    loading,
    loginUser,
    logoutUser,
    isAuthenticated: !!token
  };
}
