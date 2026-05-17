import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/instrument-serif";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root")!;

// Remove the initial loader splash
const loader = document.getElementById("initial-loader");
if (loader) {
  loader.remove();
}
if ((window as any).__loaderTimeout) {
  clearTimeout((window as any).__loaderTimeout);
}

createRoot(rootElement).render(<App />);

