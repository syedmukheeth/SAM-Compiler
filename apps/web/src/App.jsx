import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import EditorPage from "./pages/EditorPage";
import DashboardPage from "./pages/DashboardPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import ConsentNotice from "./components/ConsentNotice";

export default function App() {
  return (
    <BrowserRouter>
      <ConsentNotice />
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

