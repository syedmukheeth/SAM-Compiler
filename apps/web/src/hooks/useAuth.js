import { useState, useEffect, useCallback } from "react";
import { getMe } from "../services/authApi";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("sam_token"));
  const [loading, setLoading] = useState(true);

  const logoutUser = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("sam_user");
    localStorage.removeItem("sam_token");
  }, []);

  const loginUser = useCallback((userData, accessToken) => {
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem("sam_user", JSON.stringify(userData));
    localStorage.setItem("sam_token", accessToken);
  }, []);

  const fetchUser = useCallback(async (authToken) => {
    try {
      const userData = await getMe(authToken);
      setUser(userData);
      localStorage.setItem("sam_user", JSON.stringify(userData));
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
    // Capture OAuth token from redirect URL (e.g., ?token=xyz)
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get("token");
    if (oauthToken) {
      setToken(oauthToken);
      localStorage.setItem("sam_token", oauthToken);
      // Clean the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (token) {
      const savedUser = localStorage.getItem("sam_user");
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
