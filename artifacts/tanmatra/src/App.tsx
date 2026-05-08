import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/lib/cartContext";
import { OrdersProvider } from "@/lib/ordersContext";
import { PreferencesProvider } from "@/lib/preferencesContext";
import OnboardingQuizGate from "@/components/preferences/OnboardingQuizGate";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SupportAgentWidget from "@/components/ai/SupportAgent";
import Home from "@/pages/Home";
import Menu from "@/pages/Menu";
import Dish from "@/pages/Dish";
import { useParams } from "react-router";

function DishWithKey() {
  const { slug } = useParams<{ slug: string }>();
  return <Dish key={slug} />;
}
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Track from "@/pages/Track";
import Orders from "@/pages/Orders";
import Subscribe from "@/pages/Subscribe";
import Subscriptions from "@/pages/Subscriptions";
import Rewards from "@/pages/Rewards";
import Preferences from "@/pages/Preferences";
import Wellness from "@/pages/Wellness";
import Performance from "@/pages/Performance";
import Clinical from "@/pages/Clinical";
import Team from "@/pages/Team";
import TeamMember from "@/pages/TeamMember";
import RdPlans from "@/pages/RdPlans";
import RdPlanDetail from "@/pages/RdPlanDetail";
import RdDirectory from "@/pages/RdDirectory";
import RdProfile from "@/pages/RdProfile";
import Appointments from "@/pages/Appointments";
import RdConsole from "@/pages/RdConsole";
import CheckoutAppointment from "@/pages/CheckoutAppointment";
import AdminOpsDashboard from "@/pages/AdminOpsDashboard";
import AdminAiRuns from "@/pages/AdminAiRuns";
import AdminOpsAgent from "@/pages/AdminOpsAgent";
import AdminCmsAgent from "@/pages/AdminCmsAgent";
import AdminForecasting from "@/pages/AdminForecasting";
import AdminMenuEngineering from "@/pages/AdminMenuEngineering";
import AdminAnalytics from "@/pages/AdminAnalytics";
import AdminSupportTickets from "@/pages/AdminSupportTickets";
import GroupOrder from "@/pages/GroupOrder";
import Recipes from "@/pages/Recipes";
import RecipeDetail from "@/pages/RecipeDetail";
import Challenges from "@/pages/Challenges";
import ChallengeDetail from "@/pages/ChallengeDetail";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

const ADMIN_KEY = "tanmatra:admin:v1";

function AdminGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (typeof window === "undefined") return null;
  const flag = window.localStorage.getItem(ADMIN_KEY);
  if (flag !== "1") {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <OrdersProvider>
            <PreferencesProvider>
            <BrowserRouter basename={basename}>
              <div className="min-h-screen flex flex-col bg-clinical-dark">
                <Header />
                <OnboardingQuizGate />
                <main className="flex-1">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/menu" element={<Menu />} />
                    <Route path="/dish/:slug" element={<DishWithKey />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/track" element={<Track />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/subscribe" element={<Subscribe />} />
                    <Route path="/subscriptions" element={<Subscriptions />} />
                    <Route path="/rewards" element={<Rewards />} />
                    <Route path="/preferences" element={<Preferences />} />
                    <Route path="/wellness" element={<Wellness />} />
                    <Route path="/performance" element={<Performance />} />
                    <Route path="/clinical" element={<Clinical />} />
                    <Route path="/team" element={<Team />} />
                    <Route path="/team/:slug" element={<TeamMember />} />
                    <Route path="/plans" element={<RdPlans />} />
                    <Route path="/plans/:slug" element={<RdPlanDetail />} />
                    <Route path="/rd" element={<RdDirectory />} />
                    <Route path="/rd/:slug" element={<RdProfile />} />
                    <Route path="/appointments" element={<Appointments />} />
                    <Route path="/rd-console" element={<RdConsole />} />
                    <Route
                      path="/checkout-appointment"
                      element={<CheckoutAppointment />}
                    />
                    <Route
                      path="/admin/ops"
                      element={
                        <AdminGate>
                          <AdminOpsDashboard />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/ai-runs"
                      element={
                        <AdminGate>
                          <AdminAiRuns />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/ops-agent"
                      element={
                        <AdminGate>
                          <AdminOpsAgent />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/cms-agent"
                      element={
                        <AdminGate>
                          <AdminCmsAgent />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/forecasting"
                      element={
                        <AdminGate>
                          <AdminForecasting />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/menu-engineering"
                      element={
                        <AdminGate>
                          <AdminMenuEngineering />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/analytics"
                      element={
                        <AdminGate>
                          <AdminAnalytics />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/support-tickets"
                      element={
                        <AdminGate>
                          <AdminSupportTickets />
                        </AdminGate>
                      }
                    />
                    <Route path="/group/:code" element={<GroupOrder />} />
                    <Route path="/recipes" element={<Recipes />} />
                    <Route path="/recipes/:slug" element={<RecipeDetail />} />
                    <Route path="/challenges" element={<Challenges />} />
                    <Route path="/challenges/:slug" element={<ChallengeDetail />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </main>
                <Footer />
                <SupportAgentWidget />
              </div>
              <Toaster theme="dark" position="top-right" richColors />
            </BrowserRouter>
            </PreferencesProvider>
          </OrdersProvider>
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
