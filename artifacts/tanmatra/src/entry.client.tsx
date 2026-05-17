import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
  // Belt-and-suspenders: also cleared by useEffect in Root after mount
  window.__clearTanmatraLoader?.();
});

declare global {
  interface Window {
    __clearTanmatraLoader?: () => void;
  }
}
