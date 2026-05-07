import { useState } from "react";
import { useDeliveryTimeline, useRecordDeliveryEvent } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Clock,
  Bike,
  Phone,
  Package,
  ChefHat,
  CheckCircle2,
  User,
  Navigation,
} from "lucide-react";

const STEPS = [
  { status: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { status: "preparing", label: "Preparing", icon: ChefHat },
  { status: "ready", label: "Ready", icon: Package },
  { status: "out_for_delivery", label: "Delivery", icon: Navigation },
  { status: "delivered", label: "Delivered", icon: CheckCircle2 },
];

const EVENT_LABELS: Record<string, string> = {
  rider_assigned: "Rider assigned",
  rider_en_route_to_kitchen: "Heading to kitchen",
  rider_at_kitchen: "At kitchen",
  order_picked_up: "Order picked up",
  rider_en_route_to_customer: "Heading to you",
  rider_at_customer: "At your location",
  delivered: "Delivered",
  delivery_failed: "Delivery failed",
};

export default function Track() {
  const [orderId] = useState(1);
  const { data: timeline, isLoading } = useDeliveryTimeline(orderId);
  const recordEvent = useRecordDeliveryEvent();
  const [currentStatus, setCurrentStatus] = useState("out_for_delivery");

  const currentStepIndex = STEPS.findIndex((s) => s.status === currentStatus);

  const handleEvent = (event: string) => {
    recordEvent.mutate(
      { orderId, riderId: 1, event: event as any },
      {
        onSuccess: () => {
          toast.info(EVENT_LABELS[event]);
          if (event === "delivered") setCurrentStatus("delivered");
        },
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Track Order</h1>
        <p className="text-muted-foreground font-mono text-sm">Real-time delivery tracking</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="relative flex items-start justify-between">
            {STEPS.map((step, idx) => {
              const isActive = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const Icon = step.icon;
              return (
                <div key={step.status} className="flex flex-col items-center gap-2 flex-1 relative z-10">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                      isActive
                        ? "bg-[#D4AF37] border-[#D4AF37] text-[#050505]"
                        : "bg-muted border-muted-foreground/20 text-muted-foreground"
                    } ${isCurrent ? "ring-2 ring-[#D4AF37]/30" : ""}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-[10px] text-center leading-tight ${
                      isActive ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={`absolute top-5 left-1/2 w-full h-0.5 -z-10 ${
                        isActive ? "bg-[#D4AF37]/40" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-[#6BA3C8]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bike className="w-4 h-4 text-[#6BA3C8]" />
            Delivery Partner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#6BA3C8]/10 flex items-center justify-center">
                <User className="w-5 h-5 text-[#6BA3C8]" />
              </div>
              <div>
                <p className="font-medium">Rider on the way</p>
                <p className="text-xs text-muted-foreground">ETA 15 min</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1">
              <Phone className="w-3 h-3" />
              Call
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Delivery Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : timeline && timeline.length > 0 ? (
            <div className="space-y-4">
              {timeline.map((event, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        event.event === "delivered" ? "bg-green-500" : "bg-[#D4AF37]"
                      }`}
                    />
                    {idx < timeline.length - 1 && <div className="w-0.5 flex-1 bg-muted mt-1" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium">{EVENT_LABELS[event.event] ?? event.event}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.createdAt
                        ? new Date(event.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Just now"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No delivery events yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {[
          "rider_en_route_to_kitchen",
          "rider_at_kitchen",
          "order_picked_up",
          "rider_en_route_to_customer",
          "delivered",
        ].map((evt) => (
          <Button
            key={evt}
            size="sm"
            variant="outline"
            onClick={() => handleEvent(evt)}
            disabled={recordEvent.isPending}
          >
            {EVENT_LABELS[evt]}
          </Button>
        ))}
      </div>
    </div>
  );
}
