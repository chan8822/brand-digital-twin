import { useEffect } from "react";
import { useLocation } from "react-router";

/**
 * Scrolls the window to the top whenever the route path changes.
 * Without this, react-router preserves the previous page's scroll
 * position, which on mobile makes new pages appear to load
 * "scrolled to the bottom".
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}
