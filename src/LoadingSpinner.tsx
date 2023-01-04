import React from "react";
import { Spinner } from "vortex-api";

export default () => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
      }}
    >
      <Spinner
        style={{
          width: "64px",
          height: "64px",
        }}
      />
    </div>
  );
};
