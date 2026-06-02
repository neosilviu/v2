import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RootEntry } from "./RootEntry";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    <RootEntry />
  </StrictMode>,
);
