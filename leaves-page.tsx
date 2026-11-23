"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  Paperclip,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  FileText,
  AlertCircle,
  List,
  User,
  UserCheck,
  Ban,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/services/api-client";
import { useAuth } from "@/contexts/auth-store";
import { Unauthorized } from "@/components/layout/unauthorized";
import {
  leaveCancellationService,
  type LeaveCancellationRequest,
} from "@/services/leave-cancellation";

// Date input with a visible calendar icon. Clicking the icon (or the field) opens the
// browser's native date picker; the browser's own indicator is hidden to avoid a double icon.
function DateField({
  value,
  onChange,
  min,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      // showPicker can throw if the input is not focusable/visible; fall back to focus.
    }
    el.focus();
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        required={required}
        type="date"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={openPicker}
        className="pr-10 cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden"
      />
      <button
        type="button"
        onClick={openPicker}
        tabIndex={-1}
        aria-label="Open calendar"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80 transition-colors"
      >
        <CalendarDays className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function LeavesPage() {
  const { user, isLoading } = useAuth();
  const isAdminOrHR = user?.role === 1 || user?.role === 5;
  // Leave cancellation's Admin approval stage is Admin-only — the Manager already had their
  // dedicated first-approval turn, so role 5 doesn't also get the admin stage here.
  const isAdmin = user?.role === 1;

  const [activeTab, setActiveTab] = useState("my-history");
  const [hasInitializedTab, setHasInitializedTab] = useState(false);

  // Leave balances
  const [balances, setBalances] = useState<any>(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(true);

  // Leave categories
  const [categories, setCategories] = useState<any[]>([]);

  // Employee Profile & Manager Record
  const [myEmployee, setMyEmployee] = useState<any>(null);

  // Leaves lists
  const [myHistory, setMyHistory] = useState<any[]>([]);
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [managerQueue, setManagerQueue] = useState<any[]>([]);
  const [managerFilter, setManagerFilter] = useState<"pending" | "history" | "all">("pending");
  const [isLoadingLeaves, setIsLoadingLeaves] = useState(true);

  const isManager = managerQueue.length > 0;

  const pendingManagerQueue = useMemo(() => {
    return managerQueue.filter(
      (r) => r.approvalStage === "PENDING_MANAGER_APPROVAL" && r.status === "pending"
    );
  }, [managerQueue]);

  const historyManagerQueue = useMemo(() => {
    return managerQueue.filter(
      (r) => r.approvalStage !== "PENDING_MANAGER_APPROVAL" || r.status !== "pending"
    );
  }, [managerQueue]);

  const displayedManagerQueue = useMemo(() => {
    if (managerFilter === "pending") return pendingManagerQueue;
    if (managerFilter === "history") return historyManagerQueue;
    return managerQueue;
  }, [managerFilter, pendingManagerQueue, historyManagerQueue, managerQueue]);

  // Apply leave form
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [leaveType, setLeaveType] = useState("full_day");
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [formError, setFormError] = useState("");

  // HR Settings (Weekly Offs & Holidays)
  const [weeklyOffs, setWeeklyOffs] = useState<number[]>([0, 6]);
  const [holidays, setHolidays] = useState<any[]>([]);

  // Approval comments
  const [approvalRemarks, setApprovalRemarks] = useState<Record<string, string>>({});
  const [managerActionRemarks, setManagerActionRemarks] = useState<Record<string, string>>({});

  // Leave cancellation requests
  const [myCancellations, setMyCancellations] = useState<LeaveCancellationRequest[]>([]);
  const [cancellationManagerQueue, setCancellationManagerQueue] = useState<LeaveCancellationRequest[]>([]);
  const [cancellationAdminQueue, setCancellationAdminQueue] = useState<LeaveCancellationRequest[]>([]);
  const [isLoadingCancellations, setIsLoadingCancellations] = useState(false);
  const [cancellationManagerRemarks, setCancellationManagerRemarks] = useState<Record<string, string>>({});
  const [cancellationAdminRemarks, setCancellationAdminRemarks] = useState<Record<string, string>>({});
  const [cancellingLeave, setCancellingLeave] = useState<any>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationFormError, setCancellationFormError] = useState("");
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);

  const isCancellationManager = cancellationManagerQueue.length > 0;

  // Active (non-terminal) cancellation request per leave, so the "Cancel Leave" action
  // reflects an already-in-flight request instead of allowing a duplicate.
  const activeCancellationByLeaveId = useMemo(() => {
    const map: Record<string, LeaveCancellationRequest> = {};
    for (const c of myCancellations) {
      if (c.status === "PENDING_MANAGER" || c.status === "PENDING_ADMIN") {
        map[c.leaveId] = c;
      }
    }
    return map;
  }, [myCancellations]);

  // Most recent cancellation request per leave (active or resolved), for status display.
  const latestCancellationByLeaveId = useMemo(() => {
    const map: Record<string, LeaveCancellationRequest> = {};
    for (const c of myCancellations) {
      const existing = map[c.leaveId];
      if (!existing || new Date(c.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        map[c.leaveId] = c;
      }
    }
    return map;
  }, [myCancellations]);

  const renderApprovalBadge = (req: any) => {
    const stage = req.approvalStage;
    const status = req.status;

    if (status === "cancelled") {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">Cancelled</Badge>;
    }
    if (stage === "PENDING_MANAGER_APPROVAL") {
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">Pending Manager</Badge>;
    }
    if (stage === "PENDING_ADMIN_APPROVAL") {
      return <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20">Pending Admin</Badge>;
    }
    if (stage === "MANAGER_REJECTED") {
      return <Badge variant="secondary" className="bg-rose-500/10 text-rose-400 border-rose-500/20">Manager Rejected</Badge>;
    }
    if (stage === "ADMIN_REJECTED" || status === "rejected") {
      return <Badge variant="secondary" className="bg-rose-500/10 text-rose-400 border-rose-500/20">Admin Rejected</Badge>;
    }
    if (stage === "ADMIN_APPROVED" || status === "approved") {
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Approved</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  const renderCancellationBadge = (status: string) => {
    switch (status) {
      case "PENDING_MANAGER":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">Pending Manager</Badge>;
      case "MANAGER_REJECTED":
        return <Badge variant="secondary" className="bg-rose-500/10 text-rose-400 border-rose-500/20">Manager Rejected</Badge>;
      case "PENDING_ADMIN":
        return <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20">Pending Admin</Badge>;
      case "ADMIN_REJECTED":
        return <Badge variant="secondary" className="bg-rose-500/10 text-rose-400 border-rose-500/20">Admin Rejected</Badge>;
      case "CANCELLED":
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const formatDateInputValue = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const todayDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const todayInputValue = useMemo(
    () => formatDateInputValue(todayDate),
    [todayDate],
  );

  const hasOverlappingLeave = useCallback(
    (start: Date, end: Date) => {
      return myHistory.some((leave) => {
        const status = String(leave.status || "").toLowerCase();

        // Rejected and cancelled leave requests should not block new requests.
        if (status === "rejected" || status === "cancelled") {
          return false;
        }

        const existingStart = parseLocalDate(
          String(leave.fromDate || "").split("T")[0],
        );
        const existingEnd = parseLocalDate(
          String(leave.toDate || "").split("T")[0],
        );

        if (!existingStart || !existingEnd) {
          return false;
        }

        return start <= existingEnd && end >= existingStart;
      });
    },
    [myHistory],
  );

  const validateAttachment = (file: File | null) => {
    if (!file) return "";

    const allowedExtensions = ["pdf", "jpg", "jpeg", "png", "doc", "docx"];
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const maxSize = 5 * 1024 * 1024;

    if (!allowedExtensions.includes(extension)) {
      return "Only PDF, JPG, JPEG, PNG, DOC and DOCX files are allowed.";
    }

    if (file.size > maxSize) {
      return "Attachment must be 5 MB or smaller.";
    }

    return "";
  };

  const isWeeklyOff = useCallback((date: Date) => {
    const day = date.getDay();
    return weeklyOffs.includes(day);
  }, [weeklyOffs]);

  const isPublicHoliday = useCallback((date: Date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return holidays.some(h => {
      const hDate = new Date(h.date);
      const hKey = `${hDate.getUTCFullYear()}-${String(hDate.getUTCMonth() + 1).padStart(2, '0')}-${String(hDate.getUTCDate()).padStart(2, '0')}`;
      return key === hKey;
    });
  }, [holidays]);

  const getHolidayName = useCallback((date: Date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const holiday = holidays.find(h => {
      const hDate = new Date(h.date);
      const hKey = `${hDate.getUTCFullYear()}-${String(hDate.getUTCMonth() + 1).padStart(2, '0')}-${String(hDate.getUTCDate()).padStart(2, '0')}`;
      return key === hKey;
    });
    return holiday ? holiday.name : null;
  }, [holidays]);

  const calculateLeaveDuration = useCallback((startStr: string, endStr: string, type: string) => {
    const start = parseLocalDate(startStr);
    const end = parseLocalDate(endStr);
    if (!start || !end || start > end) return 0;

    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      if (!isWeeklyOff(current) && !isPublicHoliday(current)) {
        count += type === "half_day" ? 0.5 : 1;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  }, [isWeeklyOff, isPublicHoliday]);

  // Bulk select states
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);

  const fetchBalances = useCallback(async () => {
    setIsLoadingBalances(true);
    try {
      const data = await api.get("/leaves/balances");
      setBalances(data);
    } catch (err) {
      console.error("Failed to fetch leave balances:", err);
    }
    setIsLoadingBalances(false);
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await api.get("/leaves/categories");
      const categoryList = Array.isArray(data) ? data : [];
      setCategories(categoryList);

      if (categoryList.length > 0) {
        setCategoryId(String(categoryList[0].id));
      }
    } catch (err) {
      console.error("Failed to fetch leave categories:", err);
    }
  }, []);

  const fetchLeaves = useCallback(async () => {
    setIsLoadingLeaves(true);
    try {
      let mQueue: any[] = [];
      try {
        const res = await api.get("/leaves/manager-queue");
        mQueue = Array.isArray(res) ? res : [];
        setManagerQueue(mQueue);
      } catch (e) {
        setManagerQueue([]);
      }

      if (isAdminOrHR) {
        const all = await api.get("/leaves/all");
        setAllRequests(Array.isArray(all) ? all : []);
      }
      const mine = await api.get("/leaves/my");
      setMyHistory(Array.isArray(mine) ? mine : []);

      if (!hasInitializedTab && user) {
        setHasInitializedTab(true);
        if (mQueue.length > 0 && !isAdminOrHR) {
          setActiveTab("manager-queue");
        } else if (isAdminOrHR) {
          setActiveTab("requests");
        } else {
          setActiveTab("my-history");
        }
      }
    } catch (err) {
      console.error("Failed to fetch leave requests:", err);
    }
    setIsLoadingLeaves(false);
  }, [isAdminOrHR, hasInitializedTab, user]);

  const fetchCancellations = useCallback(async () => {
    setIsLoadingCancellations(true);
    try {
      const [mine, mQueue] = await Promise.all([
        leaveCancellationService.getMyRequests(),
        leaveCancellationService.getManagerQueue().catch(() => []),
      ]);
      setMyCancellations(mine);
      setCancellationManagerQueue(mQueue);

      if (isAdmin) {
        const adminQueue = await leaveCancellationService.getAdminQueue();
        setCancellationAdminQueue(adminQueue);
      }
    } catch (err) {
      console.error("Failed to fetch leave cancellation requests:", err);
    }
    setIsLoadingCancellations(false);
  }, [isAdmin]);

  const fetchEmployeeProfile = useCallback(async () => {
    try {
      const emp = await api.get("/employees/me");
      setMyEmployee(emp);
    } catch (err) {
      console.error("Failed to fetch employee profile:", err);
    }
  }, []);

  const fetchHRSettings = useCallback(async () => {
    try {
      const data = await api.get("/hr-settings");
      setWeeklyOffs(data.weeklyOffs ?? [0, 6]);
      setHolidays(data.holidays ?? []);
    } catch (err) {
      console.error("Failed to fetch HR settings:", err);
    }
  }, []);

  useEffect(() => {
    fetchBalances();
    fetchCategories();
    fetchLeaves();
    fetchHRSettings();
    fetchEmployeeProfile();
    fetchCancellations();
  }, [fetchBalances, fetchCategories, fetchLeaves, fetchHRSettings, fetchEmployeeProfile, fetchCancellations]);

  // Validate dates in form
  useEffect(() => {
    setFormError("");
    if (fromDate) {
      const start = parseLocalDate(fromDate);
      if (start) {
        if (start < todayDate) {
          setFormError("Past dates are not allowed for leave applications.");
          return;
        }

        if (isWeeklyOff(start)) {
          setFormError("Leave cannot be applied on Weekly Off (Saturday/Sunday).");
          return;
        }
        const hName = getHolidayName(start);
        if (hName) {
          setFormError(`Leave cannot be applied on a Public Holiday (${hName}).`);
          return;
        }
      }
    }
    if (toDate) {
      const end = parseLocalDate(toDate);
      if (end) {
        if (end < todayDate) {
          setFormError("Past dates are not allowed for leave applications.");
          return;
        }

        if (isWeeklyOff(end)) {
          setFormError("Leave cannot be applied on Weekly Off (Saturday/Sunday).");
          return;
        }
        const hName = getHolidayName(end);
        if (hName) {
          setFormError(`Leave cannot be applied on a Public Holiday (${hName}).`);
          return;
        }
      }
    }
    if (fromDate && toDate) {
      const start = parseLocalDate(fromDate);
      const end = parseLocalDate(toDate);
      if (start && end && start > end) {
        setFormError("From Date cannot be after To Date.");
        return;
      }

      if (start && end && hasOverlappingLeave(start, end)) {
        setFormError(
          "A leave request already exists for one or more selected dates.",
        );
      }
    }
  }, [fromDate, toDate, isWeeklyOff, getHolidayName, isPublicHoliday, todayDate, hasOverlappingLeave]);

  // Sorted applied leaves: descending by application date (createdAt)
  const sortedMyHistory = useMemo(() => {
    return [...myHistory].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.fromDate).getTime();
      const timeB = new Date(b.createdAt || b.fromDate).getTime();
      return timeB - timeA;
    });
  }, [myHistory]);

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!categoryId || !fromDate || !toDate || !reason) {
      setFormError("Please fill in all required fields.");
      return;
    }

    const start = parseLocalDate(fromDate);
    const end = parseLocalDate(toDate);

    if (!start || !end) {
      setFormError("Invalid date selection.");
      return;
    }

    if (start > end) {
      setFormError("From Date cannot be after To Date.");
      return;
    }

    if (start < todayDate || end < todayDate) {
      setFormError("Past dates are not allowed for leave applications.");
      return;
    }

    if (hasOverlappingLeave(start, end)) {
      setFormError(
        "A leave request already exists for one or more selected dates.",
      );
      return;
    }

    const attachmentError = validateAttachment(attachment);
    if (attachmentError) {
      setFormError(attachmentError);
      return;
    }

    if (isWeeklyOff(start) || isWeeklyOff(end)) {
      setFormError("Leave cannot be applied on Weekly Off (Saturday/Sunday).");
      return;
    }

    const startHName = getHolidayName(start);
    if (startHName) {
      setFormError(`Leave cannot be applied on a Public Holiday (${startHName}).`);
      return;
    }

    const endHName = getHolidayName(end);
    if (endHName) {
      setFormError(`Leave cannot be applied on a Public Holiday (${endHName}).`);
      return;
    }

    const duration = calculateLeaveDuration(fromDate, toDate, leaveType);
    if (duration <= 0) {
      setFormError("No working days in the selected date range.");
      return;
    }

    try {
      const payload = {
        categoryId: String(categoryId),
        fromDate: String(fromDate),
        toDate: String(toDate),
        leaveType: leaveType as "full_day" | "half_day",
        reason: reason.trim(),
      };

      await api.post("/leaves", payload);

      setIsApplyOpen(false);

      await Promise.all([
        fetchLeaves(),
        fetchBalances(),
      ]);

      // Clear form after successful submission.
      setReason("");
      setFromDate("");
      setToDate("");
      setLeaveType("full_day");
      setAttachment(null);
      setAttachmentInputKey((value) => value + 1);
      setFormError("");
    } catch (err: any) {
      console.error("Apply leave failed:", err);

      const message = err?.body?.message ?? err?.message;

      setFormError(
        Array.isArray(message)
          ? message.join(", ")
          : message || "Failed to apply leave",
      );
    }
  };

  const handleProcessLeave = async (id: string, status: "approved" | "rejected") => {
    const remarks = approvalRemarks[id] || "";
    try {
      await api.patch(`/leaves/${id}/status`, { status, remarks });
      fetchLeaves();
      if (status === "approved") fetchBalances();
    } catch (err) {
      alert((err as any).message || "Failed to process leave");
    }
  };

  const handleProcessManagerAction = async (id: string, action: "approve" | "reject") => {
    const remarks = managerActionRemarks[id] || "";
    try {
      await api.patch(`/leaves/${id}/manager-action`, { action, remarks });
      fetchLeaves();
    } catch (err) {
      alert((err as any).message || "Failed to process manager action");
    }
  };

  const handleBulkProcess = async (status: "approved" | "rejected") => {
    if (selectedRequestIds.length === 0) return;
    if (!confirm(`Are you sure you want to ${status} ${selectedRequestIds.length} request(s)?`)) return;

    try {
      await api.post("/leaves/bulk-approve", {
        ids: selectedRequestIds,
        status,
      });
      setSelectedRequestIds([]);
      fetchLeaves();
      fetchBalances();
    } catch (err) {
      alert((err as any).message || "Failed to process bulk approvals");
    }
  };

  const handleOpenCancelRequest = (leave: any) => {
    setCancellingLeave(leave);
    setCancellationReason("");
    setCancellationFormError("");
  };

  const handleSubmitCancellationRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingLeave) return;
    if (!cancellationReason.trim()) {
      setCancellationFormError("Please provide a reason for cancellation.");
      return;
    }

    setIsSubmittingCancellation(true);
    setCancellationFormError("");
    try {
      await leaveCancellationService.createRequest({
        leaveId: cancellingLeave.id,
        reason: cancellationReason.trim(),
      });
      setCancellingLeave(null);
      setCancellationReason("");
      await fetchCancellations();
    } catch (err: any) {
      const message = err?.body?.message ?? err?.message;
      setCancellationFormError(
        Array.isArray(message) ? message.join(", ") : message || "Failed to submit cancellation request",
      );
    }
    setIsSubmittingCancellation(false);
  };

  const handleCancellationManagerAction = async (id: string, action: "approve" | "reject") => {
    const remarks = cancellationManagerRemarks[id] || "";
    try {
      await leaveCancellationService.managerAction(id, action, remarks || undefined);
      fetchCancellations();
    } catch (err) {
      alert((err as any).message || "Failed to process cancellation request");
    }
  };

  const handleCancellationAdminAction = async (id: string, action: "approve" | "reject") => {
    const remarks = cancellationAdminRemarks[id] || "";
    try {
      await leaveCancellationService.adminAction(id, action, remarks || undefined);
      await Promise.all([fetchCancellations(), fetchLeaves(), fetchBalances()]);
    } catch (err) {
      alert((err as any).message || "Failed to process cancellation request");
    }
  };

  const toggleSelectRequest = (id: string) => {
    setSelectedRequestIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    const pendingIds = allRequests
      .filter((r) => r.status === "pending")
      .map((r) => r.id);

    if (selectedRequestIds.length === pendingIds.length) {
      setSelectedRequestIds([]);
    } else {
      setSelectedRequestIds(pendingIds);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 flex items-center justify-center min-h-[50vh]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!user) {
    return <Unauthorized />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Leave Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Apply for time off and monitor leave balances.
          </p>
        </div>
        <Button onClick={() => setIsApplyOpen(true)} className="shadow-lg shadow-primary/20 gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Apply For Leave
        </Button>
      </div>

      {/* Employee Profile & Assigned Manager Banner */}
      {myEmployee && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-card/60 backdrop-blur-md rounded-xl border border-border text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <span className="font-semibold text-foreground">
                {myEmployee.fullName || myEmployee.name || user?.name}
              </span>
              <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-md">
                {myEmployee.employeeId}
              </span>
            </div>
            {myEmployee.department && (
              <span className="text-xs text-muted-foreground">
                • {myEmployee.department}
                {myEmployee.designation ? ` (${myEmployee.designation})` : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-medium">Reporting Manager:</span>
            {myEmployee.manager ? (
              <Badge variant="outline" className="font-normal bg-primary/10 text-primary border-primary/20 gap-1.5 py-1">
                <UserCheck className="w-3.5 h-3.5" />
                <span>{myEmployee.manager.name || myEmployee.manager.email}</span>
                <span className="text-muted-foreground font-mono">({myEmployee.manager.email})</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="font-normal text-muted-foreground py-1">
                Direct Admin Review
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Balance Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {isLoadingBalances ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse bg-card border border-border">
              <CardContent className="h-20" />
            </Card>
          ))
        ) : balances ? (
          <>
            <Card className="bg-card/50 border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Sick Leave</p>
                <h3 className="text-xl sm:text-2xl font-bold mt-1 text-sky-400">{balances.sickBalance} <span className="text-xs text-muted-foreground">days</span></h3>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Casual Leave</p>
                <h3 className="text-xl sm:text-2xl font-bold mt-1 text-indigo-400">{balances.casualBalance} <span className="text-xs text-muted-foreground">days</span></h3>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Menstrual Leave</p>
                <h3 className="text-xl sm:text-2xl font-bold mt-1 text-pink-400">{balances.menstrualBalance} <span className="text-xs text-muted-foreground">days</span></h3>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">WFH Allowance</p>
                <h3 className="text-xl sm:text-2xl font-bold mt-1 text-emerald-400">{balances.wfhBalance} <span className="text-xs text-muted-foreground">days</span></h3>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Emergency Leave</p>
                <h3 className="text-xl sm:text-2xl font-bold mt-1 text-amber-400">{balances.emergencyBalance} <span className="text-xs text-muted-foreground">days</span></h3>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Unpaid Leaves</p>
                <h3 className="text-xl sm:text-2xl font-bold mt-1 text-rose-400">{balances.unpaidBalance} <span className="text-xs text-muted-foreground">days</span></h3>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="col-span-full p-4 border border-border text-center text-sm text-muted-foreground">
            Seed your employee profile in the Accounting menu to initialize leave balances.
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 border border-border flex flex-wrap sm:flex-nowrap overflow-x-auto h-auto max-w-full">
          {isManager && (
            <TabsTrigger value="manager-queue" className="gap-2">
              <UserCheck className="w-4 h-4" />
              Manager Queue
              {pendingManagerQueue.length > 0 && (
                <span className="ml-1 bg-amber-500 text-black px-1.5 py-0 text-[10px] h-4 min-w-4 rounded-full font-bold flex items-center justify-center">
                  {pendingManagerQueue.length}
                </span>
              )}
            </TabsTrigger>
          )}
          {isAdminOrHR && (
            <TabsTrigger value="requests" className="gap-2">
              <List className="w-4 h-4" />
              Admin Queue / All Requests
            </TabsTrigger>
          )}
          <TabsTrigger value="my-history" className="gap-2">
            <Clock className="w-4 h-4" />
            My Applied Leaves
          </TabsTrigger>
          {isCancellationManager && (
            <TabsTrigger value="cancellation-manager-queue" className="gap-2">
              <Ban className="w-4 h-4" />
              Cancellation Requests
              {cancellationManagerQueue.filter((c) => c.status === "PENDING_MANAGER").length > 0 && (
                <span className="ml-1 bg-amber-500 text-black px-1.5 py-0 text-[10px] h-4 min-w-4 rounded-full font-bold flex items-center justify-center">
                  {cancellationManagerQueue.filter((c) => c.status === "PENDING_MANAGER").length}
                </span>
              )}
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="cancellation-admin-queue" className="gap-2">
              <Ban className="w-4 h-4" />
              Cancellation Approvals
              {cancellationAdminQueue.length > 0 && (
                <span className="ml-1 bg-sky-500 text-black px-1.5 py-0 text-[10px] h-4 min-w-4 rounded-full font-bold flex items-center justify-center">
                  {cancellationAdminQueue.length}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Manager Approval Queue Tab */}
        {isManager && (
          <TabsContent value="manager-queue" className="space-y-4 outline-none">
            {/* Filter Pills for Manager Queue */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-3 rounded-xl border border-border">
              <div className="flex items-center gap-2">
                <Button
                  variant={managerFilter === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setManagerFilter("pending")}
                  className="text-xs h-8 gap-1.5"
                >
                  <span>Awaiting My Action</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-background/40">
                    {pendingManagerQueue.length}
                  </Badge>
                </Button>
                <Button
                  variant={managerFilter === "history" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setManagerFilter("history")}
                  className="text-xs h-8 gap-1.5"
                >
                  <span>Team Leave History</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-background/40">
                    {historyManagerQueue.length}
                  </Badge>
                </Button>
                <Button
                  variant={managerFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setManagerFilter("all")}
                  className="text-xs h-8 gap-1.5"
                >
                  <span>All Subordinate Requests</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-background/40">
                    {managerQueue.length}
                  </Badge>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Approve requests to forward them to Admin for final review.
              </p>
            </div>

            <Card className="border border-border bg-card/40 backdrop-blur-md">
              <CardContent className="p-0">
                {isLoadingLeaves ? (
                  <div className="p-12 flex items-center justify-center">
                    <Spinner className="w-8 h-8" />
                  </div>
                ) : displayedManagerQueue.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                    {managerFilter === "pending"
                      ? "No subordinate leave requests currently awaiting your manager approval."
                      : managerFilter === "history"
                      ? "No previous subordinate leave requests found in history."
                      : "No subordinate leave requests found."}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Category & Dates</TableHead>
                        <TableHead>Duration / Type</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Manager Review & Action</TableHead>
                        <TableHead>Admin Final Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedManagerQueue.map((req) => {
                        const fromStr = new Date(req.fromDate).toLocaleDateString();
                        const toStr = new Date(req.toDate).toLocaleDateString();
                        const isAwaitingMyAction =
                          req.approvalStage === "PENDING_MANAGER_APPROVAL" && req.status === "pending";
                        const isManagerApproved =
                          req.managerApprovedById ||
                          req.approvalStage === "PENDING_ADMIN_APPROVAL" ||
                          req.approvalStage === "ADMIN_APPROVED" ||
                          (req.status === "approved" && req.managerApprovedById) ||
                          (req.approvalStage === "ADMIN_REJECTED" && req.managerApprovedById);
                        const isManagerRejected = req.approvalStage === "MANAGER_REJECTED";

                        return (
                          <TableRow key={req.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-semibold text-sm">
                              <div>
                                <p className="font-semibold">{req.user?.name || req.user?.email}</p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {req.user?.employee?.employeeId || "Offline"}
                                  {req.user?.employee?.department ? ` • ${req.user.employee.department}` : ""}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <Badge variant="outline" className="font-mono text-xs">
                                  {req.category?.name}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <CalendarDays className="w-3 h-3 text-primary shrink-0" />
                                  {fromStr} to {toStr}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>
                                <span className="font-semibold">
                                  {req.leaveType === "half_day" ? "Half Day" : "Full Day"}
                                </span>
                                <p className="text-xs text-muted-foreground font-semibold">
                                  {calculateLeaveDuration(
                                    req.fromDate.split("T")[0],
                                    req.toDate.split("T")[0],
                                    req.leaveType
                                  )}{" "}
                                  working day(s)
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm max-w-xs truncate" title={req.reason}>
                              {req.reason}
                            </TableCell>
                            <TableCell>
                              {isAwaitingMyAction ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    placeholder="Manager remarks (optional)"
                                    value={managerActionRemarks[req.id] || ""}
                                    onChange={(e) =>
                                      setManagerActionRemarks({
                                        ...managerActionRemarks,
                                        [req.id]: e.target.value,
                                      })
                                    }
                                    className="h-8 text-xs w-[160px]"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleProcessManagerAction(req.id, "approve")}
                                    className="h-8 w-8 text-emerald-400 hover:bg-emerald-500/10"
                                    title="Manager Approve (Forward to Admin)"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleProcessManagerAction(req.id, "reject")}
                                    className="h-8 w-8 text-rose-400 hover:bg-rose-500/10"
                                    title="Manager Reject"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : isManagerApproved ? (
                                <div className="space-y-1">
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  >
                                    Approved & Forwarded to Admin
                                  </Badge>
                                  {req.managerRemarks && (
                                    <p className="text-xs text-muted-foreground italic">
                                      "{req.managerRemarks}"
                                    </p>
                                  )}
                                  {req.managerApprovedAt && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {new Date(req.managerApprovedAt).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                              ) : isManagerRejected ? (
                                <div className="space-y-1">
                                  <Badge
                                    variant="secondary"
                                    className="bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  >
                                    Rejected by Manager
                                  </Badge>
                                  {req.managerRemarks && (
                                    <p className="text-xs text-muted-foreground italic">
                                      "{req.managerRemarks}"
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {req.approvalStage === "PENDING_MANAGER_APPROVAL" ? (
                                <div>
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  >
                                    Awaiting Manager Action First
                                  </Badge>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Will route to admin after your approval
                                  </p>
                                </div>
                              ) : req.approvalStage === "PENDING_ADMIN_APPROVAL" ? (
                                <div>
                                  <Badge
                                    variant="outline"
                                    className="bg-sky-500/10 text-sky-400 border-sky-500/20"
                                  >
                                    Pending Admin Approval
                                  </Badge>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    In Admin Approval Queue
                                  </p>
                                </div>
                              ) : req.approvalStage === "ADMIN_APPROVED" || req.status === "approved" ? (
                                <div>
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  >
                                    Admin Approved
                                  </Badge>
                                  <p className="text-[11px] text-emerald-400/90 mt-0.5">
                                    Approved by {req.approvedBy?.name || req.approvedBy?.email || "Admin"}
                                  </p>
                                  {req.remarks && (
                                    <p className="text-xs text-muted-foreground italic mt-0.5">
                                      "{req.remarks}"
                                    </p>
                                  )}
                                </div>
                              ) : req.approvalStage === "ADMIN_REJECTED" ||
                                (req.status === "rejected" && req.approvalStage !== "MANAGER_REJECTED") ? (
                                <div>
                                  <Badge
                                    variant="secondary"
                                    className="bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  >
                                    Admin Rejected
                                  </Badge>
                                  <p className="text-[11px] text-rose-400/90 mt-0.5">
                                    Rejected by {req.approvedBy?.name || req.approvedBy?.email || "Admin"}
                                  </p>
                                  {req.remarks && (
                                    <p className="text-xs text-muted-foreground italic mt-0.5">
                                      "{req.remarks}"
                                    </p>
                                  )}
                                </div>
                              ) : req.approvalStage === "MANAGER_REJECTED" ? (
                                <div>
                                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                                    Not Forwarded
                                  </Badge>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Rejected at manager review
                                  </p>
                                </div>
                              ) : (
                                <Badge variant="secondary">{req.status}</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdminOrHR && (
          <TabsContent value="requests" className="space-y-4 outline-none">
            {/* Bulk Actions Header */}
            {selectedRequestIds.length > 0 && (
              <div className="p-3 bg-muted/40 border border-border rounded-xl flex items-center justify-between">
                <span className="text-xs font-semibold">{selectedRequestIds.length} request(s) selected</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10" onClick={() => handleBulkProcess("approved")}>
                    Approve Selected
                  </Button>
                  <Button variant="outline" size="sm" className="border-rose-500/20 text-rose-400 hover:bg-rose-500/10" onClick={() => handleBulkProcess("rejected")}>
                    Reject Selected
                  </Button>
                </div>
              </div>
            )}

            {/* List Table */}
            <Card className="border border-border bg-card/40 backdrop-blur-md">
              <CardContent className="p-0">
                {isLoadingLeaves ? (
                  <div className="p-12 flex items-center justify-center">
                    <Spinner className="w-8 h-8" />
                  </div>
                ) : allRequests.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                    No leave requests found in the system.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox checked={selectedRequestIds.length > 0 && selectedRequestIds.length === allRequests.filter(r => r.status === "pending" && r.approvalStage === "PENDING_ADMIN_APPROVAL").length} onCheckedChange={toggleSelectAll} />
                        </TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Duration / Type</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Stage / Status</TableHead>
                        <TableHead>Admin Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRequests.map((req) => {
                        const isMyOwnRequest =
                          req.userId === user?.id ||
                          (user?.email && req.user?.email?.toLowerCase() === user.email.toLowerCase());
                        const isPendingAdmin = req.status === "pending" && req.approvalStage === "PENDING_ADMIN_APPROVAL";
                        const isAwaitingManager = req.status === "pending" && req.approvalStage === "PENDING_MANAGER_APPROVAL";
                        const fromStr = new Date(req.fromDate).toLocaleDateString();
                        const toStr = new Date(req.toDate).toLocaleDateString();
                        return (
                          <TableRow key={req.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell>
                              {isPendingAdmin && !isMyOwnRequest ? (
                                <Checkbox checked={selectedRequestIds.includes(req.id)} onCheckedChange={() => toggleSelectRequest(req.id)} />
                              ) : null}
                            </TableCell>
                            <TableCell className="font-semibold text-sm">
                              <div>
                                <p className="font-semibold">{req.user?.name || req.user?.email}</p>
                                <p className="text-xs text-muted-foreground font-mono">{req.user?.employee?.employeeId || "Offline"}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">
                                {req.category?.name}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-1.5">
                                <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span>{fromStr} to {toStr}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>
                                <span className="font-semibold">{req.leaveType === "half_day" ? "Half Day" : "Full Day"}</span>
                                <p className="text-xs text-muted-foreground font-semibold">
                                  {calculateLeaveDuration(
                                    req.fromDate.split("T")[0],
                                    req.toDate.split("T")[0],
                                    req.leaveType
                                  )} working day(s)
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm max-w-xs truncate" title={req.reason}>
                              {req.reason}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {renderApprovalBadge(req)}
                                {req.managerRemarks && (
                                  <p className="text-[11px] text-muted-foreground italic">Mgr: "{req.managerRemarks}"</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {isPendingAdmin && !isMyOwnRequest ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    placeholder="Admin remarks (optional)"
                                    value={approvalRemarks[req.id] || ""}
                                    onChange={(e) => setApprovalRemarks({ ...approvalRemarks, [req.id]: e.target.value })}
                                    className="h-8 text-xs w-[160px]"
                                  />
                                  <Button variant="ghost" size="icon" onClick={() => handleProcessLeave(req.id, "approved")} className="h-8 w-8 text-emerald-400 hover:bg-emerald-500/10" title="Admin Approve">
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleProcessLeave(req.id, "rejected")} className="h-8 w-8 text-rose-400 hover:bg-rose-500/10" title="Admin Reject">
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : isPendingAdmin && isMyOwnRequest ? (
                                <span className="text-xs text-muted-foreground italic bg-muted/40 px-2 py-1 rounded">
                                  Your Own Request (Awaiting Admin Review)
                                </span>
                              ) : isAwaitingManager ? (
                                <span className="text-xs text-amber-400/90 font-medium">Awaiting Manager</span>
                              ) : (
                                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  {req.remarks && <span className="italic">"{req.remarks}"</span>}
                                  {!req.remarks && <span>—</span>}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="my-history" className="outline-none">
          <Card className="border border-border bg-card/40 backdrop-blur-md">
            <CardContent className="p-0">
              {isLoadingLeaves ? (
                <div className="p-12 flex items-center justify-center">
                  <Spinner className="w-8 h-8" />
                </div>
              ) : sortedMyHistory.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                  You have not applied for any leaves yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Applied Date</TableHead>
                      <TableHead>From Date</TableHead>
                      <TableHead>To Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status & Stage</TableHead>
                      <TableHead>Cancellation</TableHead>
                      <TableHead>Remarks / Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedMyHistory.map((req) => {
                      const appliedDateStr = req.createdAt
                        ? new Date(req.createdAt).toLocaleDateString()
                        : "—";
                      const activeCancellation = activeCancellationByLeaveId[req.id];
                      const latestCancellation = latestCancellationByLeaveId[req.id];
                      // Both pending (not yet decided) and approved leaves must go through the
                      // manager -> admin cancellation-request workflow — employees never cancel
                      // a leave directly, regardless of what stage it's at.
                      const canRequestCancellation =
                        (req.status === "approved" || req.status === "pending") && !activeCancellation;
                      return (
                        <TableRow key={req.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-semibold">{req.category?.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                              <span>{appliedDateStr}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span>{new Date(req.fromDate).toLocaleDateString()}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span>{new Date(req.toDate).toLocaleDateString()}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="capitalize">{req.leaveType.replace("_", " ")}</span>
                            <p className="text-xs text-muted-foreground font-semibold">
                              {calculateLeaveDuration(
                                req.fromDate.split("T")[0],
                                req.toDate.split("T")[0],
                                req.leaveType
                              )} working day(s)
                            </p>
                          </TableCell>
                          <TableCell className="text-sm max-w-xs truncate" title={req.reason}>{req.reason}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {renderApprovalBadge(req)}
                              {req.manager && (
                                <p className="text-[10px] text-muted-foreground">Mgr: {req.manager.name || req.manager.email}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {latestCancellation ? (
                              <div className="space-y-1">
                                {renderCancellationBadge(latestCancellation.status)}
                                {latestCancellation.status === "MANAGER_REJECTED" && latestCancellation.managerRemarks && (
                                  <p className="text-[11px] text-muted-foreground italic">"{latestCancellation.managerRemarks}"</p>
                                )}
                                {latestCancellation.status === "ADMIN_REJECTED" && latestCancellation.adminRemarks && (
                                  <p className="text-[11px] text-muted-foreground italic">"{latestCancellation.adminRemarks}"</p>
                                )}
                              </div>
                            ) : canRequestCancellation ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenCancelRequest(req)}
                                className="h-8 text-xs gap-1.5 text-rose-400 border-rose-500/20 hover:bg-rose-500/10"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                Cancel Leave
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              {req.managerRemarks && <p className="italic">Mgr: "{req.managerRemarks}"</p>}
                              {req.remarks && <p className="italic">Admin: "{req.remarks}"</p>}
                              {!req.managerRemarks && !req.remarks && <span>—</span>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manager: Leave Cancellation Requests Queue */}
        {isCancellationManager && (
          <TabsContent value="cancellation-manager-queue" className="outline-none">
            <Card className="border border-border bg-card/40 backdrop-blur-md">
              <CardContent className="p-0">
                {isLoadingCancellations ? (
                  <div className="p-12 flex items-center justify-center">
                    <Spinner className="w-8 h-8" />
                  </div>
                ) : cancellationManagerQueue.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                    No leave cancellation requests from your team.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Leave Type</TableHead>
                        <TableHead>Leave Dates</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Cancellation Reason</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cancellationManagerQueue.map((c) => {
                        const isPendingMine = c.status === "PENDING_MANAGER";
                        const leave = c.leave;
                        return (
                          <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-sm">
                              <p className="font-semibold">{c.user?.employee?.fullName || c.user?.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{c.user?.employee?.employeeId}</p>
                            </TableCell>
                            <TableCell className="text-sm">
                              <Badge variant="outline" className="font-mono text-xs">{leave?.category?.name}</Badge>
                              <p className="text-xs text-muted-foreground mt-1 capitalize">{leave?.leaveType?.replace("_", " ")}</p>
                            </TableCell>
                            <TableCell className="text-sm">
                              {leave ? (
                                <div className="flex items-center gap-1.5">
                                  <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                                  <span>{new Date(leave.fromDate).toLocaleDateString()} to {new Date(leave.toDate).toLocaleDateString()}</span>
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {leave
                                ? `${calculateLeaveDuration(leave.fromDate.split("T")[0], leave.toDate.split("T")[0], leave.leaveType)} working day(s)`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-sm max-w-xs truncate" title={c.reason}>{c.reason}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                                <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                              </div>
                            </TableCell>
                            <TableCell>{renderCancellationBadge(c.status)}</TableCell>
                            <TableCell>
                              {isPendingMine ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    placeholder="Remarks (optional)"
                                    value={cancellationManagerRemarks[c.id] || ""}
                                    onChange={(e) => setCancellationManagerRemarks({ ...cancellationManagerRemarks, [c.id]: e.target.value })}
                                    className="h-8 text-xs w-[150px]"
                                  />
                                  <Button variant="ghost" size="icon" onClick={() => handleCancellationManagerAction(c.id, "approve")} className="h-8 w-8 text-emerald-400 hover:bg-emerald-500/10" title="Approve">
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleCancellationManagerAction(c.id, "reject")} className="h-8 w-8 text-rose-400 hover:bg-rose-500/10" title="Reject">
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">{c.managerRemarks || "—"}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Admin: Leave Cancellation Approvals */}
        {isAdmin && (
          <TabsContent value="cancellation-admin-queue" className="outline-none">
            <Card className="border border-border bg-card/40 backdrop-blur-md">
              <CardContent className="p-0">
                {isLoadingCancellations ? (
                  <div className="p-12 flex items-center justify-center">
                    <Spinner className="w-8 h-8" />
                  </div>
                ) : cancellationAdminQueue.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                    No leave cancellation requests awaiting admin review.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Manager</TableHead>
                        <TableHead>Leave Dates</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Cancellation Reason</TableHead>
                        <TableHead>Manager Decision</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cancellationAdminQueue.map((c) => {
                        const isPendingAdmin = c.status === "PENDING_ADMIN";
                        const leave = c.leave;
                        return (
                          <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-sm">
                              <p className="font-semibold">{c.user?.employee?.fullName || c.user?.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{c.user?.employee?.employeeId}</p>
                            </TableCell>
                            <TableCell className="text-sm">{c.manager?.name || c.manager?.email || "—"}</TableCell>
                            <TableCell className="text-sm">
                              {leave ? (
                                <div className="flex items-center gap-1.5">
                                  <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                                  <span>{new Date(leave.fromDate).toLocaleDateString()} to {new Date(leave.toDate).toLocaleDateString()}</span>
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {leave
                                ? `${calculateLeaveDuration(leave.fromDate.split("T")[0], leave.toDate.split("T")[0], leave.leaveType)} working day(s)`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-sm max-w-xs truncate" title={c.reason}>{c.reason}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate italic">{c.managerRemarks || "—"}</TableCell>
                            <TableCell>{renderCancellationBadge(c.status)}</TableCell>
                            <TableCell>
                              {isPendingAdmin ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    placeholder="Remarks (optional)"
                                    value={cancellationAdminRemarks[c.id] || ""}
                                    onChange={(e) => setCancellationAdminRemarks({ ...cancellationAdminRemarks, [c.id]: e.target.value })}
                                    className="h-8 text-xs w-[150px]"
                                  />
                                  <Button variant="ghost" size="icon" onClick={() => handleCancellationAdminAction(c.id, "approve")} className="h-8 w-8 text-emerald-400 hover:bg-emerald-500/10" title="Approve (cancels the leave)">
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleCancellationAdminAction(c.id, "reject")} className="h-8 w-8 text-rose-400 hover:bg-rose-500/10" title="Reject">
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">{c.adminRemarks || "—"}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Apply Leave Modal */}
      {isApplyOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto shadow-2xl p-4 sm:p-6"
          >
            <h2 className="text-xl font-bold mb-4">Apply For Leave</h2>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleApplySubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Leave Category</label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    <CalendarDays className="w-3.5 h-3.5 text-primary" />
                    From Date
                  </label>
                  <DateField
                    required
                    min={todayInputValue}
                    value={fromDate}
                    onChange={(value) => {
                      setFromDate(value);
                      if (toDate && value > toDate) setToDate(value);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    <CalendarDays className="w-3.5 h-3.5 text-primary" />
                    To Date
                  </label>
                  <DateField
                    required
                    min={fromDate || todayInputValue}
                    value={toDate}
                    onChange={setToDate}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Leave Type</label>
                <Select value={leaveType} onValueChange={setLeaveType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Leave Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_day">Full Day</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                  </SelectContent>
                </Select>
                {fromDate && toDate && !formError && (
                  <div className="text-xs text-emerald-400 font-semibold mt-1.5">
                    Calculated Duration: {calculateLeaveDuration(fromDate, toDate, leaveType)} working day(s) (excluding weekly offs and public holidays).
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Reason</label>
                <Textarea required placeholder="Describe the reason for leave..." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  <Paperclip className="w-4 h-4 text-primary" />
                  Attachment (Optional)
                </label>

                <Input
                  key={attachmentInputKey}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0] ?? null;
                    const error = validateAttachment(selectedFile);

                    if (error) {
                      setFormError(error);
                      setAttachment(null);
                      e.target.value = "";
                      return;
                    }

                    setFormError("");
                    setAttachment(selectedFile);
                  }}
                />

                <p className="text-[11px] text-muted-foreground">
                  Allowed: PDF, JPG, JPEG, PNG, DOC, DOCX. Maximum size: 5 MB.
                </p>

                {attachment && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">
                          {attachment.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {(attachment.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-rose-400"
                      onClick={() => {
                        setAttachment(null);
                        setAttachmentInputKey((value) => value + 1);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setIsApplyOpen(false)}>Cancel</Button>
                <Button type="submit">Submit Request</Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Cancel Leave (Request Cancellation) Modal */}
      {cancellingLeave && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto shadow-2xl p-4 sm:p-6"
          >
            <h2 className="text-xl font-bold mb-1">Request Leave Cancellation</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Your manager reviews this first, then Admin gives the final approval. The leave
              is only cancelled once Admin approves.
            </p>

            {cancellationFormError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cancellationFormError}</span>
              </div>
            )}

            <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <span className="font-semibold">{cancellingLeave.category?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dates</span>
                <span className="font-semibold flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-primary" />
                  {new Date(cancellingLeave.fromDate).toLocaleDateString()} to{" "}
                  {new Date(cancellingLeave.toDate).toLocaleDateString()}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmitCancellationRequest} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Reason for Cancellation
                </label>
                <Textarea
                  required
                  placeholder="Why do you need to cancel this leave?"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setCancellingLeave(null)} disabled={isSubmittingCancellation}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingCancellation}>
                  {isSubmittingCancellation ? "Submitting..." : "Submit Cancellation Request"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
