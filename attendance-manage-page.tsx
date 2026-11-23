"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Search,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-store";
import { Unauthorized } from "@/components/layout/unauthorized";
import { api, ApiError } from "@/services/api-client";
import {
  adminAttendanceService,
  type AdminAttendanceRecord,
  type AdminAttendanceStatus,
} from "@/services/admin-attendance";
import { AttendanceStatusBadge } from "@/components/attendance/status-badge";
import { disputeService, type AttendanceDispute } from "@/services/attendance-disputes";
import { DisputeStatusBadge } from "@/components/attendance/dispute-status-badge";

// Calendar / clock icon of native date & time inputs: black in light mode, white in dark mode
const DATE_INPUT_ICON_CLASS =
  "[color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer";

interface EmployeeOption {
  id: string;
  userId: string;
  employeeId: string;
  fullName: string;
  department: string;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTimeDisplay(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toTimeInputValue(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AdminAttendanceManagePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 1;
  const isAdminOrManager = user?.role === 1 || user?.role === 5;

  if (!isAdminOrManager) {
    return <Unauthorized />;
  }

  return <AdminAttendanceManageContent isAdmin={isAdmin} />;
}

function AdminAttendanceManageContent({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState("records");

  // List state
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<AdminAttendanceStatus | "all">("all");
  const [selectedLate, setSelectedLate] = useState<"all" | "true" | "false">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Employees for the selector
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // Add/Edit dialog
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AdminAttendanceRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formEmployeeUserId, setFormEmployeeUserId] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStatus, setFormStatus] = useState<AdminAttendanceStatus>("present");
  const [formCheckIn, setFormCheckIn] = useState("");
  const [formCheckOut, setFormCheckOut] = useState("");
  const [formRemarks, setFormRemarks] = useState("");

  useEffect(() => {
    api
      .get("/employees")
      .then((data) => setEmployees(Array.isArray(data) ? data.filter((e: any) => e.userId) : []))
      .catch((e) => console.error("Failed to load employees:", e));
  }, []);

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminAttendanceService.getAttendanceRecords({
        page,
        limit,
        search: search || undefined,
        userId: selectedEmployee,
        status: selectedStatus,
        late: selectedLate,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setRecords(res.records);
      setTotalPages(res.pagination.pages);
      setTotalRecords(res.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load attendance records.");
    }
    setIsLoading(false);
  }, [page, limit, search, selectedEmployee, selectedStatus, selectedLate, dateFrom, dateTo]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleResetFilters = () => {
    setSearch("");
    setSelectedEmployee("all");
    setSelectedStatus("all");
    setSelectedLate("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const handleOpenAddModal = () => {
    setEditingRecord(null);
    setFormEmployeeUserId("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormStatus("present");
    setFormCheckIn("");
    setFormCheckOut("");
    setFormRemarks("Attendance added by Admin");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (record: AdminAttendanceRecord) => {
    setEditingRecord(record);
    setFormEmployeeUserId(record.userId);
    setFormDate(record.date.slice(0, 10));
    setFormStatus(record.status);
    setFormCheckIn(toTimeInputValue(record.checkInAt));
    setFormCheckOut(toTimeInputValue(record.checkOutAt));
    setFormRemarks(record.remarks || "");
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingRecord && !formEmployeeUserId) {
      toast.error("Please select an employee.");
      return;
    }
    if (formStatus !== "absent" && !formCheckIn) {
      toast.error("Check-in time is required unless status is Absent.");
      return;
    }
    if (formCheckIn && formCheckOut && formCheckOut <= formCheckIn) {
      toast.error("Out Time must be later than In Time.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingRecord) {
        await adminAttendanceService.updateAttendanceRecord(editingRecord.id, {
          status: formStatus,
          checkInTime: formStatus === "absent" ? undefined : formCheckIn || undefined,
          checkOutTime: formStatus === "absent" ? undefined : formCheckOut || undefined,
          remarks: formRemarks,
        });
        toast.success("Attendance record updated.");
      } else {
        await adminAttendanceService.createAttendanceRecord({
          userId: formEmployeeUserId,
          date: formDate,
          status: formStatus,
          checkInTime: formStatus === "absent" ? undefined : formCheckIn || undefined,
          checkOutTime: formStatus === "absent" ? undefined : formCheckOut || undefined,
          remarks: formRemarks,
        });
        toast.success("Attendance record added.");
      }
      setIsModalOpen(false);
      fetchRecords();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(
          "Attendance record already exists for this employee on this date. Use Edit instead.",
        );
      } else {
        toast.error(err instanceof ApiError ? err.message : "Failed to save attendance record.");
      }
    }
    setIsSaving(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Attendance Management
          </h1>
          <p className="text-muted-foreground mt-1">
            View, add, and correct employee attendance records — including previous dates.
          </p>
        </div>
        {isAdmin && activeTab === "records" && (
          <Button onClick={handleOpenAddModal} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Attendance
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 border border-border flex flex-wrap sm:flex-nowrap overflow-x-auto h-auto max-w-full">
          <TabsTrigger value="records">Attendance Records</TabsTrigger>
          {isAdmin && <TabsTrigger value="disputes">Disputes</TabsTrigger>}
        </TabsList>

        <TabsContent value="records" className="space-y-4 outline-none">
          {/* Filters */}
          <Card className="border border-border bg-card/50">
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <div className="space-y-1.5 flex-1 min-w-[180px]">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Name, employee ID, email"
                    className="pl-8 w-full"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1.5 w-full sm:w-auto min-w-[160px]">
                <Label className="text-xs">Employee</Label>
                <Select
                  value={selectedEmployee}
                  onValueChange={(v) => {
                    setSelectedEmployee(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="All Employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.userId} value={emp.userId}>
                        {emp.fullName} ({emp.employeeId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 w-full sm:w-auto min-w-[130px]">
                <Label className="text-xs">Status</Label>
                <Select
                  value={selectedStatus}
                  onValueChange={(v) => {
                    setSelectedStatus(v as AdminAttendanceStatus | "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="half_day">Half-day</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 w-full sm:w-auto min-w-[120px]">
                <Label className="text-xs">Late</Label>
                <Select
                  value={selectedLate}
                  onValueChange={(v) => {
                    setSelectedLate(v as "all" | "true" | "false");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Late</SelectItem>
                    <SelectItem value="false">On Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 w-full sm:w-auto min-w-[140px]">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  className={`w-full sm:w-40 ${DATE_INPUT_ICON_CLASS}`}
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-auto min-w-[140px]">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  className={`w-full sm:w-40 ${DATE_INPUT_ICON_CLASS}`}
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleResetFilters} className="w-full sm:w-auto">
                Reset
              </Button>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-12 flex items-center justify-center">
                  <Spinner className="w-8 h-8" />
                </div>
              ) : error ? (
                <div className="p-12 text-center text-destructive">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  {error}
                </div>
              ) : records.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                  No attendance records found.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-bold">Employee</TableHead>
                        <TableHead className="font-bold">Date</TableHead>
                        <TableHead className="font-bold">In Time</TableHead>
                        <TableHead className="font-bold">Out Time</TableHead>
                        <TableHead className="font-bold">Working Hours</TableHead>
                        <TableHead className="font-bold">Status</TableHead>
                        <TableHead className="font-bold">Late</TableHead>
                        <TableHead className="font-bold">Remarks</TableHead>
                        {isAdmin && <TableHead className="font-bold">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((r) => (
                        <TableRow key={r.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="text-sm">
                            <p className="font-semibold">
                              {r.user?.employee?.fullName || r.user?.name || "—"}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {r.user?.employee?.employeeId}
                            </p>
                          </TableCell>
                          <TableCell className="font-semibold text-sm">
                            {formatDateDisplay(r.date)}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {formatTimeDisplay(r.checkInAt)}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {formatTimeDisplay(r.checkOutAt)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.workingMinutes != null
                              ? `${Math.floor(r.workingMinutes / 60)}h ${r.workingMinutes % 60}m`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <AttendanceStatusBadge status={r.status.replace("_", "-")} />
                          </TableCell>
                          <TableCell>
                            {r.lateArrival ? (
                              <span className="text-rose-400 font-bold text-xs">
                                {r.lateMinutes} min
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                            {r.remarks || "—"}
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => handleOpenEditModal(r)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="flex flex-col items-center justify-between gap-4 border-t p-4 sm:flex-row">
                    <div className="text-xs text-muted-foreground">
                      Showing {records.length > 0 ? (page - 1) * limit + 1 : 0} to{" "}
                      {Math.min(page * limit, totalRecords)} of {totalRecords} records
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="h-8 gap-1 text-xs"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Previous
                      </Button>
                      <div className="text-xs font-medium px-2">
                        Page {page} of {totalPages}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="h-8 gap-1 text-xs"
                      >
                        Next <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="disputes" className="outline-none">
            <AdminDisputesTab onAppliedCorrection={fetchRecords} />
          </TabsContent>
        )}
      </Tabs>

      {/* Add / Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleSubmitForm}>
            <DialogHeader>
              <DialogTitle>
                {editingRecord ? "Edit Attendance" : "Add Attendance"}
              </DialogTitle>
              <DialogDescription>
                {editingRecord
                  ? "Correct in/out time, status, or remarks for this record."
                  : "Add a missing attendance record for an employee on any date."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Employee *</Label>
                  {editingRecord ? (
                    <Input
                      disabled
                      value={
                        editingRecord.user?.employee?.fullName ||
                        editingRecord.user?.name ||
                        editingRecord.userId
                      }
                    />
                  ) : (
                    <Select value={formEmployeeUserId} onValueChange={setFormEmployeeUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((emp) => (
                          <SelectItem key={emp.userId} value={emp.userId}>
                            {emp.fullName} ({emp.employeeId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    disabled={!!editingRecord}
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className={DATE_INPUT_ICON_CLASS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Status *</Label>
                  <Select
                    value={formStatus}
                    onValueChange={(v) => setFormStatus(v as AdminAttendanceStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="half_day">Half-day</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>In Time</Label>
                  <Input
                    type="time"
                    disabled={formStatus === "absent"}
                    value={formCheckIn}
                    onChange={(e) => setFormCheckIn(e.target.value)}
                    className={DATE_INPUT_ICON_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Out Time</Label>
                  <Input
                    type="time"
                    disabled={formStatus === "absent"}
                    value={formCheckOut}
                    onChange={(e) => setFormCheckOut(e.target.value)}
                    className={DATE_INPUT_ICON_CLASS}
                  />
                </div>
              </div>

              {formStatus !== "absent" && (
                <p className="text-[11px] text-muted-foreground -mt-2">
                  Present/Half-day status is auto-recalculated from In/Out time once both are
                  set, using the configured office hours &amp; grace period.
                </p>
              )}

              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Textarea
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="e.g. Attendance added by Admin"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : editingRecord ? "Save Changes" : "Add Attendance"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminDisputesTab({ onAppliedCorrection }: { onAppliedCorrection: () => void }) {
  const [disputes, setDisputes] = useState<AttendanceDispute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [remarksById, setRemarksById] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await disputeService.getAdminQueue();
      setDisputes(data);
    } catch (err) {
      console.error("Failed to load admin dispute queue:", err);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setProcessingId(id);
    try {
      await disputeService.adminAction(id, action, remarksById[id]?.trim() || undefined);
      toast.success(
        action === "approve"
          ? "Dispute approved — attendance record updated."
          : "Dispute rejected. Attendance record left unchanged.",
      );
      fetchQueue();
      if (action === "approve") onAppliedCorrection();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to process dispute.");
    }
    setProcessingId(null);
  };

  return (
    <Card className="border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center">
            <Spinner className="w-8 h-8" />
          </div>
        ) : disputes.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
            No attendance disputes awaiting admin review.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-bold">Employee</TableHead>
                <TableHead className="font-bold">Manager</TableHead>
                <TableHead className="font-bold">Attendance Date</TableHead>
                <TableHead className="font-bold">Reason</TableHead>
                <TableHead className="font-bold">Requested Change</TableHead>
                <TableHead className="font-bold">Manager Decision</TableHead>
                <TableHead className="font-bold">Status</TableHead>
                <TableHead className="font-bold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disputes.map((d) => {
                const isPending = d.status === "PENDING_ADMIN";
                return (
                  <TableRow key={d.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="text-sm">
                      <p className="font-semibold">{d.user?.employee?.fullName || d.user?.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {d.user?.employee?.employeeId}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{d.manager?.name || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {formatDateDisplay(d.date)}
                      {!d.attendanceRecordId && (
                        <span className="block text-[10px] text-muted-foreground">
                          missing day
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate" title={d.reason}>
                      {d.reason}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {d.requestedCheckInTime || "—"} → {d.requestedCheckOutTime || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                      {d.managerRemarks || "—"}
                    </TableCell>
                    <TableCell>
                      <DisputeStatusBadge status={d.status} />
                    </TableCell>
                    <TableCell>
                      {isPending ? (
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Remarks (optional)"
                            className="h-8 w-36 text-xs"
                            value={remarksById[d.id] ?? ""}
                            onChange={(e) =>
                              setRemarksById((prev) => ({ ...prev, [d.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="icon"
                            className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={processingId === d.id}
                            onClick={() => handleAction(d.id, "approve")}
                            title="Approve"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-8 w-8"
                            disabled={processingId === d.id}
                            onClick={() => handleAction(d.id, "reject")}
                            title="Reject"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {d.adminRemarks || "—"}
                        </span>
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
  );
}
