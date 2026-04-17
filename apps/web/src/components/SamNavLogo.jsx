import React from "react";
import OfficialLogo from "./OfficialLogo";

const SamNavLogo = ({ theme }) => {
  return (
    <div className="hover:scale-110 transition-all duration-500">
      <OfficialLogo theme={theme} size={32} />
    </div>
  );
};

export default React.memo(SamNavLogo);
