// client/src/pages/admin/employees.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  UserPlus,
  Loader2,
  Users,
  Filter,
  Clock,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  UserCheck,
  Building2,
  Shield,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SafeUser } from "@shared/schema";
import { DEPARTMENTS } from "@shared/schema";
import { cn } from "@/lib/utils";

// Use a constant for "no selection" instead of empty string
const NO_DEPARTMENT = "none";

// Refinement function for conditional shift time validation
const shiftTimeRefinement = (data: any, ctx: z.RefinementCtx) => {
  if (data.shiftType === "one_shift") {
    if (!data.shiftStartTime || data.shiftStartTime === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start time is required for one shift",
        path: ["shiftStartTime"],
      });
    }
    if (!data.shiftEndTime || data.shiftEndTime === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time is required for one shift",
        path: ["shiftEndTime"],
      });
    }
  }

  if (data.shiftType === "two_shifts") {
    if (!data.morningShiftStart || data.morningShiftStart === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Morning start time is required",
        path: ["morningShiftStart"],
      });
    }
    if (!data.morningShiftEnd || data.morningShiftEnd === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Morning end time is required",
        path: ["morningShiftEnd"],
      });
    }
    if (!data.eveningShiftStart || data.eveningShiftStart === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evening start time is required",
        path: ["eveningShiftStart"],
      });
    }
    if (!data.eveningShiftEnd || data.eveningShiftEnd === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evening end time is required",
        path: ["eveningShiftEnd"],
      });
    }
  }
};

// Base schema fields (without password)
const baseEmployeeFields = {
  username: z.string().min(3, "Username must be at least 3 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  department: z.string().optional(),
  position: z.string().optional(),
  role: z.enum(["superadmin", "admin", "employee"]).default("employee"),
  salary: z.coerce.number().optional().or(z.literal("")),
  shiftType: z.enum(["one_shift", "two_shifts", "open"]).default("one_shift"),
  shiftStartTime: z.string().optional(),
  shiftEndTime: z.string().optional(),
  morningShiftStart: z.string().optional(),
  morningShiftEnd: z.string().optional(),
  eveningShiftStart: z.string().optional(),
  eveningShiftEnd: z.string().optional(),
  phone: z.string().optional(),
  whatsappPreference: z.enum(["both", "breaks_only", "shift_reports_only", "none"]).default("both"),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
};

// Schema for creating a new employee (password required)
const createEmployeeSchema = z.object({
  ...baseEmployeeFields,
  password: z.string().min(4, "Password must be at least 4 characters"),
}).superRefine(shiftTimeRefinement);

// Schema for updating an existing employee (password optional)
const updateEmployeeSchema = z.object({
  ...baseEmployeeFields,
  password: z.string().min(4, "Password must be at least 4 characters").optional().or(z.literal("")),
}).superRefine(shiftTimeRefinement);

type CreateEmployeeFormData = z.infer<typeof createEmployeeSchema>;
type UpdateEmployeeFormData = z.infer<typeof updateEmployeeSchema>;
type EmployeeFormData = CreateEmployeeFormData | UpdateEmployeeFormData;

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
}

// Generate consistent avatar color based on name
function getAvatarColor(name: string) {
  const colors = [
    "bg-gradient-to-br from-rose-400 to-rose-600",
    "bg-gradient-to-br from-blue-400 to-blue-600",
    "bg-gradient-to-br from-emerald-400 to-emerald-600",
    "bg-gradient-to-br from-violet-400 to-violet-600",
    "bg-gradient-to-br from-amber-400 to-amber-600",
    "bg-gradient-to-br from-cyan-400 to-cyan-600",
    "bg-gradient-to-br from-pink-400 to-pink-600",
    "bg-gradient-to-br from-indigo-400 to-indigo-600",
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

// Shift Type Display Component
function ShiftTypeCard({
  type,
  selected,
  onSelect,
  icon: Icon,
  title,
  description,
}: {
  type: string;
  selected: boolean;
  onSelect: () => void;
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
        "hover:border-primary/50 hover:bg-primary/5",
        selected
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-slate-200 dark:border-slate-800"
      )}
    >
      <div className={cn(
        "p-3 rounded-full",
        selected
          ? "bg-primary text-white"
          : "bg-slate-100 dark:bg-slate-800 text-slate-500"
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-center">
        <p className={cn(
          "font-medium text-sm",
          selected ? "text-primary" : "text-slate-700 dark:text-slate-300"
        )}>
          {title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </button>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  icon: Icon,
  gradient,
  iconBg,
}: {
  title: string;
  value: number;
  icon: any;
  gradient: string;
  iconBg: string;
}) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl p-5 text-white",
      gradient
    )}>
      <div className="relative z-10">
        <p className="text-sm font-medium opacity-90">{title}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </div>
      <div className={cn(
        "absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-xl",
        iconBg
      )}>
        <Icon className="h-6 w-6" />
      </div>
      {/* Decorative circles */}
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute -right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5" />
    </div>
  );
}

export default function EmployeesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<SafeUser | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: employees, isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/employees"],
  });

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(editingUser ? updateEmployeeSchema : createEmployeeSchema),
    defaultValues: {
      username: "",
      password: "",
      firstName: "",
      lastName: "",
      email: "",
      department: NO_DEPARTMENT,
      position: "",
      role: "employee",
      salary: undefined,
      shiftType: "one_shift",
      shiftStartTime: "",
      shiftEndTime: "",
      morningShiftStart: "",
      morningShiftEnd: "",
      eveningShiftStart: "",
      eveningShiftEnd: "",
      phone: "",
      whatsappPreference: "both",
      address: "",
      emergencyContact: "",
    },
  });

  const shiftType = useWatch({
    control: form.control,
    name: "shiftType",
  });

  // Calculate stats
  const totalEmployees = employees?.length || 0;
  const activeEmployees = employees?.filter(e => e.isActive).length || 0;
  const adminCount = employees?.filter(e => e.role === "admin").length || 0;
  const uniqueDepartments = new Set(employees?.map(e => e.department).filter(Boolean)).size;

  const createMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      const res = await apiRequest("POST", "/api/admin/employees", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create employee");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Employee created successfully",
        className: "bg-emerald-50 border-emerald-200 text-emerald-800",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create employee",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EmployeeFormData> }) => {
      const res = await apiRequest("PATCH", `/api/admin/employees/${id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update employee");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      setIsDialogOpen(false);
      setEditingUser(null);
      form.reset();
      toast({
        title: "Success",
        description: "Employee updated successfully",
        className: "bg-emerald-50 border-emerald-200 text-emerald-800",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update employee",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/employees/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete employee");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      toast({
        title: "Success",
        description: "Employee deleted successfully",
        className: "bg-emerald-50 border-emerald-200 text-emerald-800",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete employee",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EmployeeFormData) => {
    const cleanedData: any = { ...data };

    if (cleanedData.department === NO_DEPARTMENT || cleanedData.department === "") {
      cleanedData.department = null;
    }

    if (cleanedData.salary === "" || cleanedData.salary === undefined || isNaN(cleanedData.salary)) {
      cleanedData.salary = null;
    }

    if (cleanedData.shiftType === "open") {
      cleanedData.shiftStartTime = null;
      cleanedData.shiftEndTime = null;
      cleanedData.morningShiftStart = null;
      cleanedData.morningShiftEnd = null;
      cleanedData.eveningShiftStart = null;
      cleanedData.eveningShiftEnd = null;
    } else if (cleanedData.shiftType === "one_shift") {
      cleanedData.morningShiftStart = null;
      cleanedData.morningShiftEnd = null;
      cleanedData.eveningShiftStart = null;
      cleanedData.eveningShiftEnd = null;
    } else if (cleanedData.shiftType === "two_shifts") {
      cleanedData.shiftStartTime = null;
      cleanedData.shiftEndTime = null;
    }

    const optionalFields = [
      'email', 'position', 'phone', 'address', 'emergencyContact',
      'shiftStartTime', 'shiftEndTime',
      'morningShiftStart', 'morningShiftEnd',
      'eveningShiftStart', 'eveningShiftEnd'
    ];
    for (const field of optionalFields) {
      if (cleanedData[field] === "") {
        cleanedData[field] = null;
      }
    }

    if (editingUser) {
      if (!cleanedData.password || cleanedData.password === "") {
        delete cleanedData.password;
      }
      updateMutation.mutate({
        id: editingUser.id,
        data: cleanedData,
      });
    } else {
      createMutation.mutate(cleanedData);
    }
  };

  const handleEdit = (user: SafeUser) => {
    setEditingUser(user);
    form.reset({
      username: user.username,
      password: "",
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email || "",
      department: user.department || NO_DEPARTMENT,
      position: user.position || "",
      role: user.role as "admin" | "employee",
      salary: user.salary || undefined,
      shiftType: (user.shiftType as "one_shift" | "two_shifts" | "open") || "one_shift",
      shiftStartTime: user.shiftStartTime || "",
      shiftEndTime: user.shiftEndTime || "",
      morningShiftStart: (user as any).morningShiftStart || "",
      morningShiftEnd: (user as any).morningShiftEnd || "",
      eveningShiftStart: (user as any).eveningShiftStart || "",
      eveningShiftEnd: (user as any).eveningShiftEnd || "",
      phone: user.phone || "",
      whatsappPreference: (user.whatsappPreference as "both" | "breaks_only" | "shift_reports_only" | "none") || "both",
      address: user.address || "",
      emergencyContact: user.emergencyContact || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (user: SafeUser) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteMutation.mutate(userToDelete.id);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingUser(null);
    form.reset({
      username: "",
      password: "",
      firstName: "",
      lastName: "",
      email: "",
      department: NO_DEPARTMENT,
      position: "",
      role: "employee",
      salary: undefined,
      shiftType: "one_shift",
      shiftStartTime: "",
      shiftEndTime: "",
      morningShiftStart: "",
      morningShiftEnd: "",
      eveningShiftStart: "",
      eveningShiftEnd: "",
      phone: "",
      whatsappPreference: "both",
      address: "",
      emergencyContact: "",
    });
  };

  const handleAddNew = () => {
    setEditingUser(null);
    form.reset({
      username: "",
      password: "",
      firstName: "",
      lastName: "",
      email: "",
      department: NO_DEPARTMENT,
      position: "",
      role: "employee",
      salary: undefined,
      shiftType: "one_shift",
      shiftStartTime: "",
      shiftEndTime: "",
      morningShiftStart: "",
      morningShiftEnd: "",
      eveningShiftStart: "",
      eveningShiftEnd: "",
      phone: "",
      whatsappPreference: "both",
      address: "",
      emergencyContact: "",
    });
    setIsDialogOpen(true);
  };

  const filteredEmployees = employees?.filter((emp) => {
    // Search Filter
    let matchesSearch = true;
    if (searchQuery.trim()) {
      const queryTerms = searchQuery.toLowerCase().trim().split(/\s+/).filter(term => term.length > 0);
      const searchableText = `
        ${emp.firstName} 
        ${emp.lastName} 
        ${emp.username} 
        ${emp.department || ""} 
        ${emp.position || ""} 
        ${emp.email || ""}
      `.toLowerCase();

      matchesSearch = queryTerms.every(term => searchableText.includes(term));
    }

    // Department Filter
    const matchesDepartment =
      departmentFilter === "all" || emp.department === departmentFilter;

    return matchesSearch && matchesDepartment;
  });

  return (
    <ScrollArea className="h-full">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
          {/* Stats Section */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Employees"
              value={totalEmployees}
              icon={Users}
              gradient="bg-gradient-to-br from-blue-500 to-blue-600"
              iconBg="bg-white/20"
            />
            <StatCard
              title="Active Members"
              value={activeEmployees}
              icon={UserCheck}
              gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
              iconBg="bg-white/20"
            />
            <StatCard
              title="Departments"
              value={uniqueDepartments}
              icon={Building2}
              gradient="bg-gradient-to-br from-violet-500 to-violet-600"
              iconBg="bg-white/20"
            />
            <StatCard
              title="Administrators"
              value={adminCount}
              icon={Shield}
              gradient="bg-gradient-to-br from-amber-500 to-orange-500"
              iconBg="bg-white/20"
            />
          </div>

          {/* Main Content Card */}
          <Card className="shadow-xl shadow-slate-200/50 dark:shadow-none border-0 bg-white dark:bg-slate-900 overflow-hidden">
            {/* Header with Search and Filters */}
            <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                      Team Directory
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {filteredEmployees?.length || 0} team members
                      {searchQuery || departmentFilter !== "all" ? " found" : " in total"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  <div className="relative flex-1 lg:flex-none">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search employees..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 h-11 w-full lg:w-72 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl focus-visible:ring-primary/20"
                    />
                  </div>
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger className="h-11 w-full sm:w-48 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-slate-400" />
                        <SelectValue placeholder="All Departments" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {DEPARTMENTS.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <Button
                      onClick={handleAddNew}
                      className="h-11 px-5 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Employee
                    </Button>

                    {/* MODAL FORM */}
                    <DialogContent className="sm:max-w-2xl max-h-[90vh]">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <UserPlus className="h-5 w-5" />
                          {editingUser ? "Edit Employee" : "Add New Employee"}
                        </DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="max-h-[70vh] pr-4">
                        <Form {...form}>
                          <form
                            onSubmit={form.handleSubmit(onSubmit, (errors) => {
                              console.error("Form validation errors:", errors);
                              toast({
                                title: "Validation Error",
                                description: "Please check all tabs for required fields.",
                                variant: "destructive",
                              });
                            })}
                            className="space-y-6"
                          >
                            <Tabs defaultValue="basic" className="w-full">
                              <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                                <TabsTrigger value="work">Work Details</TabsTrigger>
                                <TabsTrigger value="contact">Contact</TabsTrigger>
                              </TabsList>

                              <TabsContent value="basic" className="space-y-4 mt-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="firstName"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>First Name *</FormLabel>
                                        <FormControl>
                                          <Input placeholder="John" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="lastName"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Last Name *</FormLabel>
                                        <FormControl>
                                          <Input placeholder="Doe" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="username"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Username *</FormLabel>
                                        <FormControl>
                                          <Input placeholder="johndoe" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>
                                          Password {editingUser ? "(leave blank to keep current)" : "*"}
                                        </FormLabel>
                                        <FormControl>
                                          <Input type="password" placeholder="••••••" {...field} />
                                        </FormControl>
                                        {!editingUser && (
                                          <FormDescription>
                                            Minimum 4 characters
                                          </FormDescription>
                                        )}
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                      <FormItem className="col-span-2">
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                          <Input type="email" placeholder="john@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="role"
                                    render={({ field }) => (
                                      <FormItem className="col-span-2">
                                        <FormLabel>Role *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                          <FormControl>
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select role" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value="employee">Employee</SelectItem>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            {user?.role === "superadmin" && (
                                              <SelectItem value="superadmin">Super Admin</SelectItem>
                                            )}
                                          </SelectContent>
                                        </Select>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </TabsContent>

                              <TabsContent value="work" className="space-y-6 mt-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="department"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Department</FormLabel>
                                        <Select
                                          onValueChange={field.onChange}
                                          value={field.value || NO_DEPARTMENT}
                                        >
                                          <FormControl>
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select department" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value={NO_DEPARTMENT}>
                                              <span className="text-muted-foreground">No Department</span>
                                            </SelectItem>
                                            {DEPARTMENTS.map((dept) => (
                                              <SelectItem key={dept} value={dept}>
                                                {dept}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="position"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Position</FormLabel>
                                        <FormControl>
                                          <Input placeholder="Developer" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="salary"
                                    render={({ field }) => (
                                      <FormItem className="col-span-2">
                                        <FormLabel>Salary (PKR)</FormLabel>
                                        <FormControl>
                                          <Input
                                            type="number"
                                            placeholder="50000"
                                            {...field}
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              field.onChange(val === "" ? undefined : Number(val));
                                            }}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>

                                <Separator />

                                <div className="space-y-4">
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">Shift Type</h4>
                                    <p className="text-xs text-muted-foreground">
                                      Select the type of shift schedule for this employee
                                    </p>
                                  </div>

                                  <FormField
                                    control={form.control}
                                    name="shiftType"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormControl>
                                          <div className="grid grid-cols-3 gap-3">
                                            <ShiftTypeCard
                                              type="one_shift"
                                              selected={field.value === "one_shift"}
                                              onSelect={() => field.onChange("one_shift")}
                                              icon={Sun}
                                              title="One Shift"
                                              description="Single work period"
                                            />
                                            <ShiftTypeCard
                                              type="two_shifts"
                                              selected={field.value === "two_shifts"}
                                              onSelect={() => field.onChange("two_shifts")}
                                              icon={Clock}
                                              title="Two Shifts"
                                              description="Morning & Evening"
                                            />
                                            <ShiftTypeCard
                                              type="open"
                                              selected={field.value === "open"}
                                              onSelect={() => field.onChange("open")}
                                              icon={Sunrise}
                                              title="Open/Flexible"
                                              description="No fixed hours"
                                            />
                                          </div>
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />

                                  {shiftType === "one_shift" && (
                                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-4">
                                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                                        <Sun className="w-4 h-4 text-amber-500" />
                                        Shift Schedule
                                        <span className="text-xs text-red-500 font-normal">(Required)</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                          control={form.control}
                                          name="shiftStartTime"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel className="flex items-center gap-2">
                                                <Sunrise className="w-4 h-4 text-orange-500" />
                                                Start Time *
                                              </FormLabel>
                                              <FormControl>
                                                <Input
                                                  type="time"
                                                  {...field}
                                                  value={field.value || ""}
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <FormField
                                          control={form.control}
                                          name="shiftEndTime"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel className="flex items-center gap-2">
                                                <Sunset className="w-4 h-4 text-purple-500" />
                                                End Time *
                                              </FormLabel>
                                              <FormControl>
                                                <Input
                                                  type="time"
                                                  {...field}
                                                  value={field.value || ""}
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {shiftType === "two_shifts" && (
                                    <div className="space-y-4">
                                      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 space-y-4">
                                        <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                                          <Sun className="w-4 h-4" />
                                          Morning Shift
                                          <span className="text-xs text-red-500 font-normal">(Required)</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                          <FormField
                                            control={form.control}
                                            name="morningShiftStart"
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                                  <Sunrise className="w-4 h-4" />
                                                  Start Time *
                                                </FormLabel>
                                                <FormControl>
                                                  <Input
                                                    type="time"
                                                    {...field}
                                                    value={field.value || ""}
                                                    className="border-amber-200 dark:border-amber-800"
                                                  />
                                                </FormControl>
                                                <FormMessage />
                                              </FormItem>
                                            )}
                                          />
                                          <FormField
                                            control={form.control}
                                            name="morningShiftEnd"
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                                  <Sunset className="w-4 h-4" />
                                                  End Time *
                                                </FormLabel>
                                                <FormControl>
                                                  <Input
                                                    type="time"
                                                    {...field}
                                                    value={field.value || ""}
                                                    className="border-amber-200 dark:border-amber-800"
                                                  />
                                                </FormControl>
                                                <FormMessage />
                                              </FormItem>
                                            )}
                                          />
                                        </div>
                                      </div>

                                      <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 space-y-4">
                                        <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-400">
                                          <Moon className="w-4 h-4" />
                                          Evening Shift
                                          <span className="text-xs text-red-500 font-normal">(Required)</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                          <FormField
                                            control={form.control}
                                            name="eveningShiftStart"
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                                                  <Sunrise className="w-4 h-4" />
                                                  Start Time *
                                                </FormLabel>
                                                <FormControl>
                                                  <Input
                                                    type="time"
                                                    {...field}
                                                    value={field.value || ""}
                                                    className="border-indigo-200 dark:border-indigo-800"
                                                  />
                                                </FormControl>
                                                <FormMessage />
                                              </FormItem>
                                            )}
                                          />
                                          <FormField
                                            control={form.control}
                                            name="eveningShiftEnd"
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                                                  <Sunset className="w-4 h-4" />
                                                  End Time *
                                                </FormLabel>
                                                <FormControl>
                                                  <Input
                                                    type="time"
                                                    {...field}
                                                    value={field.value || ""}
                                                    className="border-indigo-200 dark:border-indigo-800"
                                                  />
                                                </FormControl>
                                                <FormMessage />
                                              </FormItem>
                                            )}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {shiftType === "open" && (
                                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
                                      <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900">
                                          <Sunrise className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                                            Flexible Schedule
                                          </p>
                                          <p className="text-xs text-emerald-600 dark:text-emerald-500">
                                            This employee has no fixed shift times. They can clock in and out at any time.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </TabsContent>

                              <TabsContent value="contact" className="space-y-4 mt-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Phone Number</FormLabel>
                                        <FormControl>
                                          <Input placeholder="+92 300 1234567" {...field} value={field.value || ""} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="whatsappPreference"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>WhatsApp Notifications</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                          <FormControl>
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select preference" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value="both">All Notifications</SelectItem>
                                            <SelectItem value="breaks_only">Breaks Only</SelectItem>
                                            <SelectItem value="shift_reports_only">Shift Reports Only</SelectItem>
                                            <SelectItem value="none">None</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="address"
                                    render={({ field }) => (
                                      <FormItem className="col-span-2">
                                        <FormLabel>Address</FormLabel>
                                        <FormControl>
                                          <Input placeholder="Street address" {...field} value={field.value || ""} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="emergencyContact"
                                    render={({ field }) => (
                                      <FormItem className="col-span-2">
                                        <FormLabel>Emergency Contact</FormLabel>
                                        <FormControl>
                                          <Input placeholder="Name - Phone" {...field} value={field.value || ""} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </TabsContent>
                            </Tabs>

                            <div className="flex justify-end gap-2 pt-4 border-t">
                              <Button type="button" variant="outline" onClick={handleDialogClose}>
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                disabled={createMutation.isPending || updateMutation.isPending}
                              >
                                {(createMutation.isPending || updateMutation.isPending) && (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                {editingUser ? "Update Employee" : "Create Employee"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>

            {/* Table Content */}
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : filteredEmployees && filteredEmployees.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300 py-4">
                          Employee
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                          Department
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                          Position
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                          Shift
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                          Role
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                          Status
                        </TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((employee, index) => {
                        const fullName = `${employee.firstName} ${employee.lastName}`;
                        return (
                          <TableRow
                            key={employee.id}
                            className={cn(
                              "group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
                              index !== filteredEmployees.length - 1 && "border-b border-slate-100 dark:border-slate-800"
                            )}
                          >
                            <TableCell className="py-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-11 w-11 ring-2 ring-white dark:ring-slate-800 shadow-md">
                                  <AvatarFallback className={cn(
                                    "text-white font-semibold text-sm",
                                    getAvatarColor(fullName)
                                  )}>
                                    {getInitials(employee.firstName, employee.lastName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                                    {fullName}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                      @{employee.username}
                                    </span>
                                    {employee.email && (
                                      <>
                                        <span className="text-slate-300 dark:text-slate-600">•</span>
                                        <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                          <Mail className="h-3 w-3" />
                                          {employee.email}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {employee.department ? (
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-slate-400" />
                                  <span className="text-sm text-slate-700 dark:text-slate-300">
                                    {employee.department}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {employee.position ? (
                                <div className="flex items-center gap-2">
                                  <Briefcase className="h-4 w-4 text-slate-400" />
                                  <span className="text-sm text-slate-700 dark:text-slate-300">
                                    {employee.position}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-medium capitalize border-0",
                                  employee.shiftType === "one_shift" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                                  employee.shiftType === "two_shifts" && "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
                                  employee.shiftType === "open" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                                )}
                              >
                                {employee.shiftType === "one_shift" && <Sun className="h-3 w-3 mr-1" />}
                                {employee.shiftType === "two_shifts" && <Clock className="h-3 w-3 mr-1" />}
                                {employee.shiftType === "open" && <Sunrise className="h-3 w-3 mr-1" />}
                                {employee.shiftType?.replace(/_/g, " ") || "—"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  "font-medium border-0",
                                  employee.role === "superadmin"
                                    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                    : employee.role === "admin"
                                      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                )}
                              >
                                {employee.role === "superadmin" && <Zap className="h-3 w-3 mr-1" />}
                                {employee.role === "admin" && <Shield className="h-3 w-3 mr-1" />}
                                {employee.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-2 h-2 rounded-full",
                                  employee.isActive
                                    ? "bg-emerald-500 shadow-lg shadow-emerald-500/50"
                                    : "bg-slate-300 dark:bg-slate-600"
                                )} />
                                <span className={cn(
                                  "text-sm font-medium",
                                  employee.isActive
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-slate-500 dark:text-slate-400"
                                )}>
                                  {employee.isActive ? "Active" : "Inactive"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-9 w-9 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {/* Only superadmin can edit other superadmins */}
                                  {(employee.role !== "superadmin" || user?.role === "superadmin") && (
                                    <DropdownMenuItem onClick={() => handleEdit(employee)}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Edit Details
                                    </DropdownMenuItem>
                                  )}

                                  <DropdownMenuSeparator />

                                  {/* Nobody can delete a superadmin */}
                                  {employee.role !== "superadmin" && (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                      onClick={() => handleDelete(employee)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Employee
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mb-4">
                    <Users className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {searchQuery || departmentFilter !== "all"
                      ? "No employees found"
                      : "No team members yet"
                    }
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm mb-4">
                    {searchQuery || departmentFilter !== "all"
                      ? "Try adjusting your search or filter criteria"
                      : "Start building your team by adding your first employee"
                    }
                  </p>
                  {!searchQuery && departmentFilter === "all" && (
                    <Button onClick={handleAddNew} className="shadow-lg shadow-primary/25">
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Employee
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                    <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  Delete Employee
                </AlertDialogTitle>
                <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {userToDelete?.firstName} {userToDelete?.lastName}
                  </span>
                  ? This action cannot be undone and will also delete all associated shifts,
                  breaks, and activity logs.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </ScrollArea>
  );
}