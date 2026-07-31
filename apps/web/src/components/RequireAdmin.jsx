import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Route guard for admin-only pages.
 *
 * The dashboard exposes internal SRE metrics (queue depth, worker host stats).
 * The *link* to it was hidden behind a `user?.role !== 'admin'` check in two
 * places, but the route itself was public, so the URL was directly reachable by
 * anyone who typed it.
 */
export default function RequireAdmin({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="flex h-[100dvh] w-full items-center justify-center"
        style={{ background: "var(--sam-bg)" }}
        aria-busy="true"
      >
        <div className="sam-spinner h-8 w-8" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
