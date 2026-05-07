import { BrowserRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SupportAgentWidget from "@/components/ai/SupportAgent";
import Home from "@/pages/Home";
import Menu from "@/pages/Menu";
import Dish from "@/pages/Dish";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Track from "@/pages/Track";
import Wellness from "@/pages/Wellness";
import Performance from "@/pages/Performance";
import Clinical from "@/pages/Clinical";
import AdminOpsDashboard from "@/pages/AdminOpsDashboard";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter basename={basename}>
          <div className="min-h-screen flex flex-col bg-clinical-dark">
            <Header />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/menu" element={<Menu />} />
                <Route path="/dish/:slug" element={<Dish />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/track" element={<Track />} />
                <Route path="/wellness" element={<Wellness />} />
                <Route path="/performance" element={<Performance />} />
                <Route path="/clinical" element={<Clinical />} />
                <Route path="/admin/ops" element={<AdminOpsDashboard />} />
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
            <SupportAgentWidget />
          </div>
          <Toaster theme="dark" position="top-right" richColors />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
