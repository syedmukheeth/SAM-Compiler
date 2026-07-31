import { useState, useEffect, useCallback } from "react";
import { getMe } from "../services/authApi";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  const logoutUser = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("sam_user");
    localStorage.removeItem("token");
  }, []);

  const loginUser = useCallback((userData, accessToken) => {
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem("sam_user", JSON.stringify(userData));
    localStorage.setItem("token", accessToken);
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
    // PRIME MODE: Immediate OAuth token detection from URL.
    // This is a genuine external-input sync (the URL is set by the OAuth
    // redirect, outside React), which is exactly what an effect is for.
    const searchParams = new URLSearchParams(window.location.search);
    const oauthToken = searchParams.get("token");

    if (oauthToken) {
      // 1. Immediately persist to state and storage
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(oauthToken);
      localStorage.setItem("token", oauthToken);
      
      // 2. High-Fidelity URL Cleaning: Remove ONLY the token, leave other params (like session)
      searchParams.delete("token");
      const newSearch = searchParams.toString();
      const newRelativePathQuery = window.location.pathname + (newSearch ? `?${newSearch}` : "");
      window.history.replaceState({}, document.title, newRelativePathQuery);
    }
  }, []);


  useEffect(() => {
    // Hydrating from localStorage + verifying the session against the API is a
    // subscription to external state, not derived render data.
    if (token) {
      const savedUser = localStorage.getItem("sam_user");
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (savedUser) setUser(JSON.parse(savedUser));
      } catch {
        // Corrupt cached user - fetchUser below is the source of truth.
        localStorage.removeItem("sam_user");
      }
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
