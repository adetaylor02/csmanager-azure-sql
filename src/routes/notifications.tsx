import { createFileRoute } from "@tanstack/react-router";
import { useApp, useNotifications } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, XCircle, ShoppingCart, ClipboardCheck, ShieldAlert, Clock, Check, RotateCcw, Lock } from "lucide-react";
import type { Notification } from "@/lib/types";
import { useAuth, can } from "@/lib/auth";

const iconFor = (n: Notification) => {
  switch (n.type) {
    case "out-of-stock": return XCircle;
    case "low-stock": return AlertTriangle;
    case "reorder": return ShoppingCart;
    case "inspection": return ClipboardCheck;
    case "expiry": return Clock;
    case "coverage": return ShieldAlert;
    default: return Bell;
  }
};

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const notifs = useNotifications();
  const dismissNotification = useApp((s) => s.dismissNotification);
  const dismissAllNotifications = useApp((s) => s.dismissAllNotifications);
  const restoreNotifications = useApp((s) => s.restoreNotifications);
  const dismissedCount = useApp((s) => s.dismissedNotifications.length);
  const { role } = useAuth();
  const canAck = can(role, "notification.acknowledge");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description={`${notifs.length} active alerts`}
        actions={
          <div className="flex gap-2">
            {canAck && dismissedCount > 0 && (
              <Button variant="outline" size="sm" onClick={restoreNotifications}>
                <RotateCcw className="h-4 w-4 mr-1" /> Restore ({dismissedCount})
              </Button>
            )}
            {canAck && notifs.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => dismissAllNotifications(notifs.map((n) => n.id))}>
                <Check className="h-4 w-4 mr-1" /> Acknowledge all
              </Button>
            )}
          </div>
        }
      />
      {!canAck && (
        <Card className="flex items-center gap-2 p-3 text-xs text-muted-foreground border-dashed">
          <Lock className="h-4 w-4" /> Only Managers and Admins can acknowledge notifications.
        </Card>
      )}
      {notifs.length === 0 && (
        <Card className="p-12 text-center text-sm text-muted-foreground">No active alerts. Operations look healthy.</Card>
      )}
      <div className="space-y-2">
        {notifs.map((n) => {
          const Icon = iconFor(n);
          const tone = n.severity === "critical" ? "bg-destructive/10 text-destructive border-destructive/30"
            : n.severity === "warning" ? "bg-warning/15 text-warning-foreground border-warning/40"
            : "bg-info/10 text-info border-info/30";
          return (
            <Card key={n.id} className={`flex items-center gap-3 p-4 border ${tone}`}>
              <Icon className="h-5 w-5 shrink-0" />
              <div className="flex-1 text-sm">{n.message}</div>
              <span className="text-xs capitalize opacity-70">{n.severity}</span>
              {canAck && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissNotification(n.id)}
                  aria-label="Acknowledge and clear"
                >
                  <Check className="h-4 w-4 mr-1" /> Acknowledge
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
