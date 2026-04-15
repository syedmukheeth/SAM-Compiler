import React from "react";
import OfficialLogo from "./OfficialLogo";

export default function SamNavLogo({ theme }) {
  return (
    <div className="hover:scale-110 transition-all duration-500">
      <OfficialLogo theme={theme} size={32} />
    </div>
  );
}
