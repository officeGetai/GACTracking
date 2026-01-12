// client/src/pages/admin/settings.tsx

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Settings,
  Clock,
  Bell,
  Shield,
  Building,
  MessageSquare,
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { WasenderConfig } from "@shared/schema";

const wasenderFormSchema = z.object({
  instanceId: z.string().min(1, "Instance ID is required"),
  apiToken: z.string().optional(),
  isActive: z.boolean().default(false),
  requestsGroupId: z.string().optional().or(z.literal("")),
  shiftReportsGroupId: z.string().optional().or(z.literal("")),
  trackingAlertsGroupId: z.string().optional().or(z.literal("")),
});

type WasenderFormData = z.infer<typeof wasenderFormSchema>;

type WasenderUpdatePayload = {
  instanceId: string;
  apiToken?: string | null;
  isActive: boolean;
  requestsGroupId?: string | null;
  shiftReportsGroupId?: string | null;
  trackingAlertsGroupId?: string | null;
};

export default function SettingsPage() {
  const [wasenderDialogOpen, setWasenderDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: wasenderConfig, isLoading: configLoading } = useQuery<WasenderConfig>({
    queryKey: ["/api/admin/wasender-config"],
  });

  const wasenderForm = useForm<WasenderFormData>({
    resolver: zodResolver(wasenderFormSchema),
    defaultValues: {
      instanceId: "",
      apiToken: "",
      isActive: false,
      requestsGroupId: "",
      shiftReportsGroupId: "",
      trackingAlertsGroupId: "",
    },
  });

  useEffect(() => {
    if (wasenderConfig) {
      wasenderForm.reset({
        instanceId: wasenderConfig.instanceId || "",
        apiToken: "",
        isActive: wasenderConfig.isActive || false,
        requestsGroupId: wasenderConfig.requestsGroupId || "",
        shiftReportsGroupId: wasenderConfig.shiftReportsGroupId || "",
        trackingAlertsGroupId: wasenderConfig.trackingAlertsGroupId || "",
      });
    }
  }, [wasenderConfig, wasenderForm]);

  const updateWasenderMutation = useMutation({
    mutationFn: async (data: WasenderUpdatePayload) => {
      const res = await apiRequest("POST", "/api/admin/wasender-config", data);
      // Throw an error if response is not OK to trigger onError
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `Server error: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wasender-config"] });
      setWasenderDialogOpen(false);
      toast({ title: "WASENDER configuration updated", description: "WhatsApp integration settings saved." });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update configuration",
        description: error.message || "An unknown error occurred.",
        variant: "destructive",
      });
    },
  });

  const testWasenderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/wasender-test");
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `Server error: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wasender-config"] });
      toast({ title: "Connection test successful!", description: "A test message was sent to the configured group." });
    },
    onError: (error: Error) => {
      toast({
        title: "Connection test failed",
        description: error.message || "Please check your Instance ID, API Token, and network connection.",
        variant: "destructive",
      });
    },
  });

  const onWasenderSubmit = (formData: WasenderFormData) => {
    const payload: WasenderUpdatePayload = {
      instanceId: formData.instanceId,
      isActive: formData.isActive,
      apiToken: formData.apiToken === "" ? null : formData.apiToken,
      requestsGroupId: formData.requestsGroupId === "" ? null : formData.requestsGroupId,
      shiftReportsGroupId: formData.shiftReportsGroupId === "" ? null : formData.shiftReportsGroupId,
      trackingAlertsGroupId: formData.trackingAlertsGroupId === "" ? null : formData.trackingAlertsGroupId,
    };

    updateWasenderMutation.mutate(payload);
  };

  const handleOpenWasenderDialog = () => {
    wasenderForm.reset({
      instanceId: wasenderConfig?.instanceId || "",
      apiToken: "",
      isActive: wasenderConfig?.isActive || false,
      requestsGroupId: wasenderConfig?.requestsGroupId || "",
      shiftReportsGroupId: wasenderConfig?.shiftReportsGroupId || "",
      trackingAlertsGroupId: wasenderConfig?.trackingAlertsGroupId || "",
    });
    setWasenderDialogOpen(true);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-1">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Configure your attendance system
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                WASENDER WhatsApp Integration
              </CardTitle>
              <CardDescription>
                Configure WhatsApp notifications for various events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {configLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading configuration...
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label>Connection Status</Label>
                        {wasenderConfig?.isActive ? (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                            <XCircle className="h-3 w-3 mr-1" />
                            Not Configured / Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {wasenderConfig?.instanceId
                          ? `Instance: ${wasenderConfig.instanceId}`
                          : "No instance configured"
                        }
                      </p>
                      {(wasenderConfig?.requestsGroupId || wasenderConfig?.shiftReportsGroupId || wasenderConfig?.trackingAlertsGroupId) && (
                        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          {wasenderConfig.requestsGroupId && <p>Requests Group: {wasenderConfig.requestsGroupId}</p>}
                          {wasenderConfig.shiftReportsGroupId && <p>Shift Reports Group: {wasenderConfig.shiftReportsGroupId}</p>}
                          {wasenderConfig.trackingAlertsGroupId && <p>Tracking Alerts Group: {wasenderConfig.trackingAlertsGroupId}</p>}
                        </div>
                      )}
                      {wasenderConfig?.lastTested && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Last tested: {new Date(wasenderConfig.lastTested).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {wasenderConfig?.instanceId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testWasenderMutation.mutate()}
                          disabled={testWasenderMutation.isPending}
                          data-testid="button-test-wasender"
                        >
                          {testWasenderMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Test
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={handleOpenWasenderDialog}
                        data-testid="button-configure-wasender"
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                      </Button>

                      <Dialog open={wasenderDialogOpen} onOpenChange={setWasenderDialogOpen}>
                        <DialogContent className="flex flex-col h-[80vh] sm:max-w-[600px]">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <MessageSquare className="h-5 w-5" />
                              WASENDER Configuration
                            </DialogTitle>
                          </DialogHeader>

                          <Form {...wasenderForm}>
                            {/* Make form flex-col and take available height with flex-grow */}
                            <form onSubmit={wasenderForm.handleSubmit(onWasenderSubmit)} className="flex flex-col flex-grow min-h-0">
                              {/* This div will handle scrolling and take up remaining space */}
                              <div className="flex-grow overflow-y-auto pr-4 pb-4">
                                <DialogDescription className="mb-4">
                                  Enter your WASENDER API credentials and specific group IDs for notifications.
                                </DialogDescription>
                                <div className="space-y-4">
                                  <FormField
                                    control={wasenderForm.control}
                                    name="instanceId"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Instance ID</FormLabel>
                                        <FormControl>
                                          <Input placeholder="your-instance-id" {...field} data-testid="input-instance-id" />
                                        </FormControl>
                                        <FormDescription>
                                          Your WASENDER instance identifier.
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={wasenderForm.control}
                                    name="apiToken"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>API Token</FormLabel>
                                        <FormControl>
                                          <Input
                                            type="password"
                                            placeholder="Enter your API token (only if updating)"
                                            {...field}
                                            data-testid="input-api-token"
                                          />
                                        </FormControl>
                                        <FormDescription>
                                          Your WASENDER API authentication token. Leave blank to keep existing.
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />

                                  <FormField
                                    control={wasenderForm.control}
                                    name="requestsGroupId"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Requests Group ID (GAC REQUESTS)</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="WhatsApp group ID for special requests"
                                            {...field}
                                            data-testid="input-requests-group-id"
                                          />
                                        </FormControl>
                                        <FormDescription>
                                          For special requests and approval notifications.
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={wasenderForm.control}
                                    name="shiftReportsGroupId"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Shift Reports Group ID (GAC SHIFT REPORTS)</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="WhatsApp group ID for shift reports"
                                            {...field}
                                            data-testid="input-shift-reports-group-id"
                                          />
                                        </FormControl>
                                        <FormDescription>
                                          For daily shift report submissions.
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={wasenderForm.control}
                                    name="trackingAlertsGroupId"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Tracking Alerts Group ID (GAC TRACKING ALERTS)</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="WhatsApp group ID for tracking alerts"
                                            {...field}
                                            data-testid="input-tracking-alerts-group-id"
                                          />
                                        </FormControl>
                                        <FormDescription>
                                          For clock in/out, breaks, and late arrival alerts.
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />

                                  <FormField
                                    control={wasenderForm.control}
                                    name="isActive"
                                    render={({ field }) => (
                                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                          <FormLabel className="text-base">Enable WhatsApp Notifications</FormLabel>
                                          <FormDescription>
                                            Globally enable or disable all WhatsApp notifications.
                                          </FormDescription>
                                        </div>
                                        <FormControl>
                                          <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            data-testid="switch-wasender-active"
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                </div> {/* End of space-y-4 for FormFields */}
                              </div> {/* End of flex-grow overflow-y-auto */}
                              {/* Buttons remain fixed at the bottom, now inside the form */}
                              <div className="flex justify-end gap-2 mt-4">
                                <Button type="button" variant="outline" onClick={() => setWasenderDialogOpen(false)}>
                                  Cancel
                                </Button>
                                <Button
                                  type="submit"
                                  disabled={updateWasenderMutation.isPending}
                                  data-testid="button-save-wasender"
                                >
                                  {updateWasenderMutation.isPending && (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  )}
                                  Save Configuration
                                </Button>
                              </div>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ... (rest of your settings cards - Organization, Work Hours, Notifications, Security) ... */}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Organization Settings
              </CardTitle>
              <CardDescription>
                Configure your organization details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    defaultValue="GAC Trackings"
                    data-testid="input-org-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select defaultValue="pkt">
                    <SelectTrigger data-testid="select-timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pkt">Pakistan Time (PKT)</SelectItem>
                      <SelectItem value="utc">UTC</SelectItem>
                      <SelectItem value="est">Eastern Time (EST)</SelectItem>
                      <SelectItem value="pst">Pacific Time (PST)</SelectItem>
                      <SelectItem value="ist">India Standard Time (IST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Work Hours
              </CardTitle>
            </CardHeader>
            <CardDescription>
              Define standard work hours and late threshold
            </CardDescription>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="start-time">Work Start Time</Label>
                  <Input
                    id="start-time"
                    type="time"
                    defaultValue="09:00"
                    data-testid="input-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-time">Work End Time</Label>
                  <Input
                    id="end-time"
                    type="time"
                    defaultValue="18:00"
                    data-testid="input-end-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="late-threshold">Late After (minutes)</Label>
                  <Input
                    id="late-threshold"
                    type="number"
                    defaultValue="15"
                    data-testid="input-late-threshold"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Weekend Working</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow attendance tracking on weekends
                  </p>
                </div>
                <Switch data-testid="switch-weekend" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardDescription>
              Configure notification preferences
            </CardDescription>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive daily attendance summaries
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-email-notifications" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Absence Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when employees are absent
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-absence-alerts" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Late Arrival Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when employees arrive late
                  </p>
                </div>
                <Switch data-testid="switch-late-alerts" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security
              </CardTitle>
            </CardHeader>
            <CardDescription>
              Security and access settings
            </CardDescription>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Require Location</Label>
                  <p className="text-sm text-muted-foreground">
                    Require location verification for clock in/out
                  </p>
                </div>
                <Switch data-testid="switch-location" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>IP Restriction</Label>
                  <p className="text-sm text-muted-foreground">
                    Only allow clock in from office network
                  </p>
                </div>
                <Switch data-testid="switch-ip-restriction" />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button data-testid="button-save-settings">
              <Settings className="h-4 w-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}