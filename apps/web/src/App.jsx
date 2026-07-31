import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import EditorPage from "./pages/EditorPage";
import DashboardPage from "./pages/DashboardPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ConsentNotice from "./components/ConsentNotice";
import RequireAdmin from "./components/RequireAdmin";

export default function App() {
  return (
    <BrowserRouter>
      <ConsentNotice />
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAdmin>
              <DashboardPage />
            </RequireAdmin>
          }
        />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </BrowserRouter>
  );
}

