import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { LinksFunction } from "react-router";
import "./index.css";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: "/src/index.css" },
];
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/lib/cartContext";
import { ThemeManager } from "@/lib/clinicalTheme";
import { OrdersProvider } from "@/lib/ordersContext";
import { PreferencesProvider } from "@/lib/preferencesContext";
import OnboardingQuizGate from "@/components/preferences/OnboardingQuizGate";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import BottomNav from "@/components/layout/BottomNav";
import ScrollToTop from "@/components/layout/ScrollToTop";
import StickyCheckoutBar from "@/components/cart/StickyCheckoutBar";
import ErrorBoundary from "@/components/layout/ErrorBoundary";

const queryClient = new QueryClient();

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <CartProvider>
                <OrdersProvider>
                  <PreferencesProvider>
                    <ThemeManager />
                    <ScrollToTop />
                    <div className="min-h-screen flex flex-col bg-clinical-dark">
                      <Header />
                      <OnboardingQuizGate />
                      <main className="flex-1 pb-20 md:pb-0">
                        <Outlet />
                      </main>
                      <Footer />
                      <BottomNav />
                      <StickyCheckoutBar />
                    </div>
                    <Toaster theme="dark" position="top-center" richColors offset={72} />
                  </PreferencesProvider>
                </OrdersProvider>
              </CartProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </ErrorBoundary>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
