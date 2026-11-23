"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users,
  CreditCard,
  Plus,
  Search,
  Eye,
  Edit2,
  CheckCircle,
  XCircle,
  Download,
  Mail,
  RefreshCw,
  MoreVertical,
  Briefcase,
  UserCheck,
  AlertCircle,
  Clock,
  Trash2,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { api, getApiUrl } from "@/services/api-client";
import { useAuth } from "@/contexts/auth-store";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "next/navigation";
import { Unauthorized } from "@/components/layout/unauthorized";

// Calendar icon of native date inputs: black in light mode, white in dark mode
const DATE_INPUT_ICON_CLASS =
  "[color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer";

export default function AccountingPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const isAdmin = user?.role === 1;

  // ============================================================
  // TABS
  // ============================================================

  const [activeTab, setActiveTab] = useState("employees");

  // ============================================================
  // EMPLOYEES
  // ============================================================

  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);

  // ============================================================
  // EMPLOYEE FORM
  // ============================================================

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [nextEmpId, setNextEmpId] = useState("");

  const [fullName, setFullName] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [panCard, setPanCard] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [address, setAddress] = useState("");
  const [dob, setDob] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [empRoleId, setEmpRoleId] = useState("3");
  const [empType, setEmpType] = useState("permanent");
  const [gender, setGender] = useState("male");
  const [salary, setSalary] = useState("");

  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [upiId, setUpiId] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");

  const [linkUserId, setLinkUserId] = useState("");
  const [linkManagerId, setLinkManagerId] = useState("");

  // ============================================================
  // AVAILABLE USERS
  // ============================================================

  const [availableUsers, setAvailableUsers] = useState<any[]>([]);

  // ============================================================
  // SEARCH / FILTER
  // ============================================================

  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // ============================================================
  // PAYROLL
  // ============================================================

  const [payrollMonth, setPayrollMonth] = useState(
    String(new Date().getMonth() + 1)
  );

  const [payrollYear, setPayrollYear] = useState(
    String(new Date().getFullYear())
  );

  const [payrollSummary, setPayrollSummary] = useState<any[]>([]);
  const [isLoadingPayroll, setIsLoadingPayroll] = useState(false);
  const [payrollMessage, setPayrollMessage] = useState("");

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // ============================================================
  // DETAILS DRAWER
  // ============================================================

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsEmp, setDetailsEmp] = useState<any>(null);

  // ============================================================
  // STATS
  // ============================================================

  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalMonthlySalary: 0,
    activeEmployees: 0,
    inactiveEmployees: 0,
  });

  // ============================================================
  // HR SETTINGS
  // ============================================================

  const [weeklyOffs, setWeeklyOffs] = useState<number[]>([0, 6]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingWeeklyOffs, setIsSavingWeeklyOffs] = useState(false);
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);

  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");

  const daysOfWeek = [
    { label: "Sunday", value: 0 },
    { label: "Monday", value: 1 },
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 },
    { label: "Thursday", value: 4 },
    { label: "Friday", value: 5 },
    { label: "Saturday", value: 6 },
  ];

  // ============================================================
  // FETCH HR SETTINGS
  // ============================================================

  const fetchHRSettings = useCallback(async () => {
    setIsLoadingSettings(true);

    try {
      const data = await api.get("/hr-settings");

      setWeeklyOffs(data.weeklyOffs ?? [0, 6]);
      setHolidays(data.holidays ?? []);
    } catch (err) {
      console.error("Failed to fetch HR settings:", err);
    }

    setIsLoadingSettings(false);
  }, []);

  // ============================================================
  // SAVE WEEKLY OFFS
  // ============================================================

  const handleSaveWeeklyOffs = async () => {
    setIsSavingWeeklyOffs(true);

    try {
      await api.patch("/hr-settings/weekly-offs", {
        days: weeklyOffs,
      });

      alert("Weekly off settings saved successfully.");

      fetchHRSettings();
    } catch (err) {
      alert((err as any).message || "Failed to save weekly offs");
    }

    setIsSavingWeeklyOffs(false);
  };

  // ============================================================
  // TOGGLE WEEKLY OFF
  // ============================================================

  const handleToggleWeeklyOff = (day: number) => {
    setWeeklyOffs((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort()
    );
  };

  // ============================================================
  // ADD HOLIDAY
  // ============================================================

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newHolidayName || !newHolidayDate) {
      alert("Please enter holiday name and date.");
      return;
    }

    setIsAddingHoliday(true);

    try {
      await api.post("/hr-settings/holidays", {
        name: newHolidayName,
        date: newHolidayDate,
      });

      setNewHolidayName("");
      setNewHolidayDate("");

      fetchHRSettings();
    } catch (err) {
      alert((err as any).message || "Failed to add holiday");
    }

    setIsAddingHoliday(false);
  };

  // ============================================================
  // DELETE HOLIDAY
  // ============================================================

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm("Are you sure you want to delete this holiday?")) return;

    try {
      await api.delete(`/hr-settings/holidays/${id}`);

      fetchHRSettings();
    } catch (err) {
      alert((err as any).message || "Failed to delete holiday");
    }
  };

  // ============================================================
  // FETCH EMPLOYEES
  // ============================================================

  const fetchEmployees = useCallback(async () => {
    setIsLoadingEmployees(true);

    try {
      const data = await api.get("/employees");

      setEmployees(data);

      const active = data.filter(
        (e: any) => e.status === "active"
      ).length;

      const inactive = data.length - active;

      const totalSal = data.reduce(
        (acc: number, curr: any) =>
          acc + (curr.salary || 0),
        0
      );

      setStats({
        totalEmployees: data.length,
        totalMonthlySalary: totalSal,
        activeEmployees: active,
        inactiveEmployees: inactive,
      });
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    }

    setIsLoadingEmployees(false);
  }, []);

  // ============================================================
  // FETCH USERS
  // ============================================================

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.get("/users");

      setAvailableUsers(data);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, []);

  // ============================================================
  // FETCH PAYROLL
  // ============================================================

  const fetchPayroll = useCallback(async () => {
    setIsLoadingPayroll(true);

    try {
      const data = await api.get(
        `/payroll/summary?month=${payrollMonth}&year=${payrollYear}`
      );

      setPayrollSummary(data);
    } catch (err) {
      console.error("Failed to fetch payroll:", err);

      setPayrollSummary([]);
    }

    setIsLoadingPayroll(false);
  }, [payrollMonth, payrollYear]);

  // ============================================================
  // INITIAL FETCH
  // ============================================================

  useEffect(() => {
    fetchEmployees();
    fetchUsers();
  }, [fetchEmployees, fetchUsers]);

  // ============================================================
  // TAB FETCH
  // ============================================================

  useEffect(() => {
    if (activeTab === "payroll") {
      fetchPayroll();
    }

    if (activeTab === "hr-settings") {
      fetchHRSettings();
    }
  }, [
    activeTab,
    fetchPayroll,
    fetchHRSettings,
  ]);

  // ============================================================
  // HR SETTINGS FETCH
  // ============================================================

  useEffect(() => {
    if (isAdmin || user?.role === 5) {
      fetchHRSettings();
    }
  }, [isAdmin, user, fetchHRSettings]);

  // ============================================================
  // CLEAR FORM
  // ============================================================

  const clearForm = () => {
    setFullName("");
    setPersonalEmail("");
    setCompanyEmail("");
    setContactNumber("");
    setEmergencyContact("");
    setPanCard("");
    setAadhaar("");
    setAddress("");
    setDob("");
    setJoiningDate("");
    setDepartment("");
    setDesignation("");
    setEmpRoleId("3");
    setEmpType("permanent");
    setGender("male");
    setSalary("");

    setBankName("");
    setAccountNumber("");
    setIfscCode("");
    setUpiId("");
    setProfilePhoto("");

    setLinkUserId("");
    setLinkManagerId("");
  };

  // ============================================================
  // OPEN ADD FORM
  // ============================================================

  const handleOpenAddForm = async () => {
    setIsEditMode(false);
    setSelectedEmp(null);

    clearForm();

    setIsFormOpen(true);

    try {
      const data = await api.get("/employees/next-id");

      setNextEmpId(data.employeeId);
    } catch (e) {
      setNextEmpId("RXI_001");
    }
  };

  // ============================================================
  // OPEN EDIT FORM
  // ============================================================

  const handleOpenEditForm = (emp: any) => {
    setIsEditMode(true);
    setSelectedEmp(emp);

    setNextEmpId(emp.employeeId);

    setFullName(emp.fullName || "");
    setPersonalEmail(emp.personalEmail || "");
    setCompanyEmail(emp.companyEmail || "");
    setContactNumber(emp.contactNumber || "");
    setEmergencyContact(emp.emergencyContactNumber || "");
    setPanCard(emp.panCardNumber || "");
    setAadhaar(emp.aadhaarNumber || "");
    setAddress(emp.address || "");

    setDob(
      emp.dateOfBirth
        ? emp.dateOfBirth.split("T")[0]
        : ""
    );

    setJoiningDate(
      emp.joiningDate
        ? emp.joiningDate.split("T")[0]
        : ""
    );

    setDepartment(emp.department || "");
    setDesignation(emp.designation || "");

    setEmpRoleId(
      emp.roleId !== undefined && emp.roleId !== null
        ? String(emp.roleId)
        : "3"
    );

    setEmpType(emp.employeeType || "permanent");
    setGender(emp.gender || "male");

    setSalary(
      emp.salary !== undefined && emp.salary !== null
        ? String(emp.salary)
        : ""
    );

    setBankName(
      emp.bankDetails?.bankName || ""
    );

    setAccountNumber(
      emp.bankDetails?.accountNumber || ""
    );

    setIfscCode(
      emp.bankDetails?.ifscCode || ""
    );

    setUpiId(
      emp.bankDetails?.upiId || ""
    );

    setProfilePhoto(
      emp.profilePhoto || ""
    );

    setLinkUserId(
      emp.userId || ""
    );

    setLinkManagerId(
      emp.managerId ||
      emp.manager?.id ||
      ""
    );

    setIsFormOpen(true);
  };

  // ============================================================
  // FORM VALIDATIONS
  // ============================================================

  const validateEmployeeForm = () => {
    const nameRegex = /^[A-Za-z][A-Za-z .'-]*$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[6-9]\d{9}$/;
    const panRegex = /^[A-Z]{5}\d{4}[A-Z]$/;
    const aadhaarRegex = /^\d{12}$/;
    const accountRegex = /^\d{9,18}$/;
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    const upiRegex = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/;

    const cleanFullName = fullName.trim();
    const cleanPersonalEmail = personalEmail.trim();
    const cleanCompanyEmail = companyEmail.trim();
    const cleanPan = panCard.trim().toUpperCase();
    const cleanIfsc = ifscCode.trim().toUpperCase();
    const cleanUpi = upiId.trim();
    const cleanBankName = bankName.trim();
    const cleanAddress = address.trim();

    if (!cleanFullName) {
      alert("Full name is required.");
      return false;
    }

    if (!nameRegex.test(cleanFullName)) {
      alert("Full name can contain only letters, spaces, apostrophes, dots, and hyphens.");
      return false;
    }

    if (!emailRegex.test(cleanPersonalEmail)) {
      alert("Please enter a valid personal email address.");
      return false;
    }

    if (!emailRegex.test(cleanCompanyEmail)) {
      alert("Please enter a valid company email address.");
      return false;
    }

    if (!phoneRegex.test(contactNumber)) {
      alert("Contact number must be exactly 10 digits and start with 6, 7, 8, or 9.");
      return false;
    }

    if (!phoneRegex.test(emergencyContact)) {
      alert("Emergency contact number must be exactly 10 digits and start with 6, 7, 8, or 9.");
      return false;
    }

    if (!panRegex.test(cleanPan)) {
      alert("Invalid PAN Card number. Example: ABCDE1234F");
      return false;
    }

    if (!aadhaarRegex.test(aadhaar)) {
      alert("Aadhaar number must contain exactly 12 digits.");
      return false;
    }

    if (!dob) {
      alert("Date of birth is required.");
      return false;
    }

    if (!joiningDate) {
      alert("Joining date is required.");
      return false;
    }

    if (new Date(dob) > new Date()) {
      alert("Date of birth cannot be in the future.");
      return false;
    }

    if (new Date(joiningDate) > new Date()) {
      alert("Joining date cannot be in the future.");
      return false;
    }

    if (new Date(joiningDate) < new Date(dob)) {
      alert("Joining date cannot be before date of birth.");
      return false;
    }

    if (!department.trim()) {
      alert("Department is required.");
      return false;
    }

    if (!designation.trim()) {
      alert("Designation is required.");
      return false;
    }

    if (!salary || !/^\d+(\.\d{1,2})?$/.test(salary) || Number(salary) <= 0) {
      alert("Please enter a valid salary greater than 0.");
      return false;
    }

    if (!cleanBankName) {
      alert("Bank name is required.");
      return false;
    }

    if (!/^[A-Za-z][A-Za-z .&'-]*$/.test(cleanBankName)) {
      alert("Bank name can contain only letters, spaces, dots, &, apostrophes, and hyphens.");
      return false;
    }

    if (!accountRegex.test(accountNumber)) {
      alert("Account number must contain 9 to 18 digits.");
      return false;
    }

    if (!ifscRegex.test(cleanIfsc)) {
      alert("Invalid IFSC code. Example: HDFC0000123");
      return false;
    }

    if (cleanUpi && !upiRegex.test(cleanUpi)) {
      alert("Invalid UPI ID. Example: name@upi");
      return false;
    }

    if (!cleanAddress || cleanAddress.length < 5) {
      alert("Please enter a valid address.");
      return false;
    }

    return true;
  };

  // ============================================================
  // FORM SUBMIT
  // ============================================================

  const handleFormSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!validateEmployeeForm()) {
      return;
    }

    const payload = {
      fullName,
      personalEmail,
      companyEmail,
      contactNumber,

      emergencyContactNumber:
        emergencyContact,

      panCardNumber:
        panCard,

      aadhaarNumber:
        aadhaar,

      address,

      dateOfBirth:
        dob,

      joiningDate,

      department,

      designation,

      roleId:
        Number(empRoleId),

      employeeType:
        empType,

      gender,

      salary:
        Number(salary),

      bankName,

      accountNumber,

      ifscCode,

      upiId:
        upiId || undefined,

      profilePhoto:
        profilePhoto || undefined,

      userId:
        linkUserId &&
        linkUserId !== "none"
          ? linkUserId
          : isEditMode
          ? null
          : undefined,

      managerId:
        linkManagerId &&
        linkManagerId !== "none"
          ? linkManagerId
          : isEditMode
          ? null
          : undefined,
    };

    try {
      if (isEditMode && selectedEmp) {
        await api.patch(
          `/employees/${selectedEmp.id}`,
          payload
        );
      } else {
        await api.post(
          "/employees",
          payload
        );
      }

      setIsFormOpen(false);

      fetchEmployees();
    } catch (err) {
      alert(
        (err as any).message ||
          "An error occurred"
      );
    }
  };

  // ============================================================
  // TOGGLE STATUS
  // ============================================================

  const handleToggleStatus = async (
    id: string,
    currentStatus: string
  ) => {
    const nextStatus =
      currentStatus === "active"
        ? "inactive"
        : "active";

    try {
      await api.patch(
        `/employees/${id}/status`,
        {
          status: nextStatus,
        }
      );

      fetchEmployees();
    } catch (err) {
      alert(
        (err as any).message ||
          "An error occurred"
      );
    }
  };

  // ============================================================
  // PAYROLL PREVIEW
  // ============================================================

  const handlePreviewPayroll = async () => {
    setIsLoadingPreview(true);
    setPayrollMessage("");

    try {
      const data = await api.get<any[]>(
        `/payroll/preview?month=${payrollMonth}&year=${payrollYear}`
      );

      setPreviewData(data);
      setIsPreviewOpen(true);
    } catch (err) {
      setPayrollMessage(
        `Error: ${(err as any).message}`
      );
    }

    setIsLoadingPreview(false);
  };

  // ============================================================
  // GENERATE PAYROLL
  // ============================================================

  const handleGeneratePayroll = async () => {
    setIsLoadingPayroll(true);
    setPayrollMessage("");

    try {
      const res = await api.post(
        "/payroll/generate",
        {
          month: Number(payrollMonth),
          year: Number(payrollYear),
        }
      );

      setPayrollMessage(
        `Payroll generated successfully for ${res.length} employee(s).`
      );

      setIsPreviewOpen(false);

      fetchPayroll();
      fetchEmployees();
    } catch (err) {
      setPayrollMessage(
        `Error: ${(err as any).message}`
      );

      alert(
        (err as any).message ||
          "Failed to generate payroll"
      );
    }

    setIsLoadingPayroll(false);
  };

  // ============================================================
  // EMAIL PAYSLIP
  // ============================================================

  const handleEmailPayslip = async (
    payslipId: string
  ) => {
    try {
      await api.post(
        `/payroll/payslip/${payslipId}/email`
      );

      alert(
        "Payslip emailed successfully."
      );

      fetchPayroll();
    } catch (err) {
      alert(
        (err as any).message ||
          "Failed to email payslip"
      );
    }
  };

  // ============================================================
  // REGENERATE PAYROLL
  // ============================================================

  const handleRegeneratePayroll = async (
    payslipId: string
  ) => {
    try {
      await api.post(
        `/payroll/payslip/${payslipId}/regenerate`
      );

      alert(
        "Payroll re-calculated and payslip updated."
      );

      fetchPayroll();
    } catch (err) {
      alert(
        (err as any).message ||
          "Failed to regenerate"
      );
    }
  };

  // ============================================================
  // DOWNLOAD PAYSLIP
  // ============================================================

  const handleDownloadPayslip = async (
    payslipId: string
  ) => {
    window.open(
      getApiUrl(
        `/payroll/payslip/${payslipId}/download`
      ),
      "_blank"
    );
  };

  // ============================================================
  // FILTERED EMPLOYEES
  // ============================================================

  const filteredEmployees =
    employees.filter((emp) => {
      const search =
        searchQuery.toLowerCase();

      const matchSearch =
        (emp.fullName || "")
          .toLowerCase()
          .includes(search) ||
        (emp.employeeId || "")
          .toLowerCase()
          .includes(search) ||
        (emp.department || "")
          .toLowerCase()
          .includes(search);

      const matchDept =
        deptFilter === "all" ||
        emp.department === deptFilter;

      const matchStatus =
        statusFilter === "all" ||
        emp.status === statusFilter;

      return (
        matchSearch &&
        matchDept &&
        matchStatus
      );
    });

  const departments = Array.from(
    new Set(
      employees.map(
        (e) => e.department
      )
    )
  );

  // ============================================================
  // CURRENCY
  // ============================================================

  const formatCurrency = (
    val: number
  ) => {
    return new Intl.NumberFormat(
      "en-IN",
      {
        style: "currency",
        currency: "INR",
      }
    ).format(val);
  };

  // ============================================================
  // LOADING
  // ============================================================

  if (isLoading) {
    return (
      <div className="p-12 flex items-center justify-center min-h-[50vh]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  // ============================================================
  // AUTHORIZATION
  // ============================================================

  if (!user || !isAdmin) {
    return <Unauthorized />;
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Payroll & HRMS
          </h1>

          <p className="text-muted-foreground mt-1">
            Manage employees, bank details, and run monthly payroll operations.
          </p>
        </div>

        {isAdmin && (
          <Button
            onClick={handleOpenAddForm}
            className="shadow-lg shadow-primary/20 gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </Button>
        )}
      </div>

      {/* ====================================================== */}
      {/* METRICS */}
      {/* ====================================================== */}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        <Card className="bg-card/50 border border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Staff
                </p>

                <h3 className="text-2xl font-bold mt-1">
                  {stats.totalEmployees}
                </h3>
              </div>

              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <Users className="w-5 h-5" />
              </div>

            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Staff
                </p>

                <h3 className="text-2xl font-bold mt-1 text-emerald-400">
                  {stats.activeEmployees}
                </h3>
              </div>

              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <UserCheck className="w-5 h-5" />
              </div>

            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Monthly Payroll Liability
                </p>

                <h3 className="text-2xl font-bold mt-1">
                  {formatCurrency(
                    stats.totalMonthlySalary
                  )}
                </h3>
              </div>

              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                <CreditCard className="w-5 h-5" />
              </div>

            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Avg. Attendance
                </p>

                <h3 className="text-2xl font-bold mt-1">
                  94.2%
                </h3>
              </div>

              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <Clock className="w-5 h-5" />
              </div>

            </div>
          </CardContent>
        </Card>

      </div>

      {/* ====================================================== */}
      {/* TABS */}
      {/* ====================================================== */}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >

        <TabsList className="bg-muted/50 p-1 border border-border">

          <TabsTrigger
            value="employees"
            className="gap-2"
          >
            <Users className="w-4 h-4" />
            Employees List
          </TabsTrigger>

          <TabsTrigger
            value="payroll"
            className="gap-2"
          >
            <CreditCard className="w-4 h-4" />
            Payroll Management
          </TabsTrigger>

          {isAdmin && (
            <TabsTrigger
              value="hr-settings"
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              HR Settings
            </TabsTrigger>
          )}

        </TabsList>

        {/* ==================================================== */}
        {/* EMPLOYEES TAB */}
        {/* ==================================================== */}

        <TabsContent
          value="employees"
          className="space-y-4 outline-none"
        >

          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">

            <div className="relative flex-1">

              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

              <Input
                placeholder="Search by name, employee ID, or department..."
                value={searchQuery}
                onChange={(e) =>
                  setSearchQuery(e.target.value)
                }
                className="pl-10"
              />

            </div>

            <div className="flex gap-2">

              <Select
                value={deptFilter}
                onValueChange={setDeptFilter}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All Departments
                  </SelectItem>

                  {departments.map(
                    (dept) => (
                      <SelectItem
                        key={dept}
                        value={dept}
                      >
                        {dept}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All Status
                  </SelectItem>

                  <SelectItem value="active">
                    Active
                  </SelectItem>

                  <SelectItem value="inactive">
                    Inactive
                  </SelectItem>
                </SelectContent>
              </Select>

            </div>
          </div>

          <Card className="border border-border bg-card/40 backdrop-blur-md">

            <CardContent className="p-0">

              {isLoadingEmployees ? (

                <div className="p-12 flex items-center justify-center">
                  <Spinner className="w-8 h-8" />
                </div>

              ) : filteredEmployees.length === 0 ? (

                <div className="p-12 text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                  No employees found matching current filters.
                </div>

              ) : (

                <div className="overflow-x-auto">

                  <Table>

                    <TableHeader>
                      <TableRow>

                        <TableHead>
                          Employee
                        </TableHead>

                        <TableHead>
                          ID
                        </TableHead>

                        <TableHead>
                          Department
                        </TableHead>

                        <TableHead>
                          Designation
                        </TableHead>

                        <TableHead>
                          Type
                        </TableHead>

                        <TableHead>
                          Salary
                        </TableHead>

                        <TableHead>
                          Status
                        </TableHead>

                        <TableHead className="w-16" />

                      </TableRow>
                    </TableHeader>

                    <TableBody>

                      {filteredEmployees.map(
                        (emp) => (

                          <TableRow
                            key={emp.id}
                            className="hover:bg-muted/30 transition-colors"
                          >

                            <TableCell className="font-medium">

                              <div className="flex items-center gap-3 min-w-[220px]">

                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm overflow-hidden border border-primary/20 shrink-0">

                                  {emp.profilePhoto ? (
                                    <img
                                      src={emp.profilePhoto}
                                      alt={emp.fullName}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    emp.fullName
                                      .charAt(0)
                                      .toUpperCase()
                                  )}

                                </div>

                                <div className="min-w-0">

                                  <p className="font-semibold text-foreground text-sm truncate max-w-[180px]">
                                    {emp.fullName}
                                  </p>

                                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                                    {emp.companyEmail}
                                  </p>

                                </div>

                              </div>

                            </TableCell>

                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {emp.employeeId}
                            </TableCell>

                            <TableCell className="text-sm">
                              {emp.department}
                            </TableCell>

                            <TableCell className="text-sm">
                              {emp.designation}
                            </TableCell>

                            <TableCell className="capitalize text-sm">
                              {emp.employeeType}
                            </TableCell>

                            <TableCell className="text-sm font-semibold">
                              {formatCurrency(emp.salary)}
                            </TableCell>

                            <TableCell>

                              <Badge
                                variant={
                                  emp.status === "active"
                                    ? "outline"
                                    : "secondary"
                                }
                                className={
                                  emp.status === "active"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : "bg-muted text-muted-foreground"
                                }
                              >
                                {emp.status}
                              </Badge>

                            </TableCell>

                            <TableCell>

                              <DropdownMenu>

                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent
                                  align="end"
                                  className="bg-popover border border-border"
                                >

                                  <DropdownMenuItem
                                    className="gap-2 cursor-pointer"
                                    onClick={() => {
                                      setDetailsEmp(emp);
                                      setIsDetailsOpen(true);
                                    }}
                                  >
                                    <Eye className="w-4 h-4 text-muted-foreground" />
                                    View Details
                                  </DropdownMenuItem>

                                  {isAdmin ||
                                  user?.role === 5 ? (
                                    <>
                                      <DropdownMenuItem
                                        className="gap-2 cursor-pointer"
                                        onClick={() =>
                                          handleOpenEditForm(
                                            emp
                                          )
                                        }
                                      >
                                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                                        Edit Details
                                      </DropdownMenuItem>

                                      <DropdownMenuItem
                                        className="gap-2 cursor-pointer"
                                        onClick={() =>
                                          handleToggleStatus(
                                            emp.id,
                                            emp.status
                                          )
                                        }
                                      >
                                        {emp.status ===
                                        "active" ? (
                                          <>
                                            <XCircle className="w-4 h-4 text-rose-400" />
                                            Deactivate
                                          </>
                                        ) : (
                                          <>
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                            Activate
                                          </>
                                        )}
                                      </DropdownMenuItem>
                                    </>
                                  ) : null}

                                  {emp.userId && (
                                    <DropdownMenuItem
                                      className="gap-2 cursor-pointer"
                                      onClick={() =>
                                        router.push(
                                          `/dashboard/attendance?userId=${emp.userId}`
                                        )
                                      }
                                    >
                                      <Clock className="w-4 h-4 text-muted-foreground" />
                                      View Attendance
                                    </DropdownMenuItem>
                                  )}

                                </DropdownMenuContent>

                              </DropdownMenu>

                            </TableCell>

                          </TableRow>
                        )
                      )}

                    </TableBody>

                  </Table>

                </div>

              )}

            </CardContent>

          </Card>

        </TabsContent>

        {/* ==================================================== */}
        {/* PAYROLL TAB */}
        {/* ==================================================== */}

        <TabsContent
          value="payroll"
          className="space-y-6 outline-none"
        >

          <Card className="border border-border bg-card/40 backdrop-blur-md">

            <CardHeader>
              <CardTitle className="text-lg font-bold">
                Generate Monthly Payroll
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">

              <div className="flex flex-wrap items-center gap-4">

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-semibold uppercase">
                    Payroll Month
                  </label>

                  <Select
                    value={payrollMonth}
                    onValueChange={setPayrollMonth}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>

                    <SelectContent>
                      {Array.from({
                        length: 12,
                      }).map((_, i) => (
                        <SelectItem
                          key={i}
                          value={String(i + 1)}
                        >
                          {new Date(
                            0,
                            i
                          ).toLocaleString(
                            "default",
                            {
                              month:
                                "long",
                            }
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-semibold uppercase">
                    Payroll Year
                  </label>

                  <Select
                    value={payrollYear}
                    onValueChange={setPayrollYear}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>

                    <SelectContent>
                      {Array.from({
                        length: 3,
                      }).map((_, i) => {
                        const yr =
                          String(
                            new Date().getFullYear() -
                              1 +
                              i
                          );

                        return (
                          <SelectItem
                            key={yr}
                            value={yr}
                          >
                            {yr}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin && (
                  <div className="flex gap-3 mt-5">

                    <Button
                      onClick={
                        handlePreviewPayroll
                      }
                      disabled={
                        isLoadingPreview ||
                        isLoadingPayroll
                      }
                      variant="outline"
                      className="border-primary text-primary hover:bg-primary/10 gap-2 shadow-sm"
                    >
                      {isLoadingPreview ? (
                        <Spinner className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}

                      Preview Payroll
                    </Button>

                    <Button
                      onClick={
                        handleGeneratePayroll
                      }
                      disabled={
                        isLoadingPayroll
                      }
                      className="shadow-lg shadow-primary/10 gap-2"
                    >
                      {isLoadingPayroll ? (
                        <Spinner className="w-4 h-4" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}

                      Run Payroll
                    </Button>

                  </div>
                )}

              </div>

              {payrollMessage && (
                <div
                  className={`p-3 rounded-lg border text-sm ${
                    payrollMessage.startsWith(
                      "Error"
                    )
                      ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  }`}
                >
                  {payrollMessage}
                </div>
              )}

            </CardContent>

          </Card>

          <Card className="border border-border bg-card/40 backdrop-blur-md">

            <CardContent className="p-0">

              {isLoadingPayroll ? (

                <div className="p-12 flex items-center justify-center">
                  <Spinner className="w-8 h-8" />
                </div>

              ) : payrollSummary.length === 0 ? (

                <div className="p-12 text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                  No payroll run found for the selected month & year.
                </div>

              ) : (

                <div className="overflow-x-auto">

                  <Table>

                    <TableHeader>
                      <TableRow>

                        <TableHead>
                          Employee
                        </TableHead>

                        <TableHead>
                          Basic Salary
                        </TableHead>

                        <TableHead>
                          Deductions
                        </TableHead>

                        <TableHead>
                          Net Pay
                        </TableHead>

                        <TableHead>
                          Payslip Status
                        </TableHead>

                        <TableHead className="text-right">
                          Actions
                        </TableHead>

                      </TableRow>
                    </TableHeader>

                    <TableBody>

                      {payrollSummary.map(
                        (item) => {
                          const deductionsSum =
                            item.baseSalary -
                            item.netSalary;

                          return (
                            <TableRow
                              key={item.id}
                              className="hover:bg-muted/30 transition-colors"
                            >

                              <TableCell className="font-medium">

                                <div>
                                  <p className="font-semibold text-foreground text-sm">
                                    {item.employee
                                      ?.fullName ||
                                      "Employee"}
                                  </p>

                                  <p className="text-xs text-muted-foreground">
                                    {item.employee
                                      ?.employeeId}
                                  </p>
                                </div>

                              </TableCell>

                              <TableCell className="text-sm">
                                {formatCurrency(
                                  item.baseSalary
                                )}
                              </TableCell>

                              <TableCell className="text-sm text-rose-400 font-medium">
                                {deductionsSum >
                                0
                                  ? `-${formatCurrency(
                                      deductionsSum
                                    )}`
                                  : "—"}
                              </TableCell>

                              <TableCell className="text-sm font-extrabold text-emerald-400">
                                {formatCurrency(
                                  item.netSalary
                                )}
                              </TableCell>

                              <TableCell>

                                <Badge
                                  variant={
                                    item.payslip
                                      ?.status ===
                                    "sent"
                                      ? "outline"
                                      : "secondary"
                                  }
                                  className={
                                    item.payslip
                                      ?.status ===
                                    "sent"
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                      : "bg-muted text-muted-foreground"
                                  }
                                >
                                  {item.payslip
                                    ?.status ||
                                    "pending"}
                                </Badge>

                              </TableCell>

                              <TableCell className="text-right">

                                <div className="flex justify-end gap-1.5">

                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                      handleDownloadPayslip(
                                        item
                                          .payslip
                                          ?.id
                                      )
                                    }
                                    className="h-8 w-8"
                                    title="Download Payslip"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                      handleEmailPayslip(
                                        item
                                          .payslip
                                          ?.id
                                      )
                                    }
                                    className="h-8 w-8"
                                    title="Email Payslip"
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                  </Button>

                                  {isAdmin && (
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() =>
                                        handleRegeneratePayroll(
                                          item.id
                                        )
                                      }
                                      className="h-8 w-8 text-indigo-400"
                                      title="Regenerate"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    </Button>
                                  )}

                                </div>

                              </TableCell>

                            </TableRow>
                          );
                        }
                      )}

                    </TableBody>

                  </Table>

                </div>

              )}

            </CardContent>

          </Card>

        </TabsContent>

        {/* ==================================================== */}
        {/* HR SETTINGS */}
        {/* ==================================================== */}

        {isAdmin && (
          <TabsContent
            value="hr-settings"
            className="space-y-6 outline-none"
          >

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Weekly Off */}
              <Card className="border border-border bg-card/40 backdrop-blur-md lg:col-span-1">

                <CardHeader>
                  <CardTitle className="text-lg font-bold">
                    Weekly Off Days
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">

                  <p className="text-sm text-muted-foreground">
                    Select the days of the week that are designated as Weekly Off. These days will automatically be excluded from leave calculations and payroll deductions.
                  </p>

                  <div className="flex flex-col gap-2">

                    {daysOfWeek.map(
                      (day) => {
                        const isSelected =
                          weeklyOffs.includes(
                            day.value
                          );

                        return (
                          <Button
                            key={
                              day.value
                            }
                            type="button"
                            variant={
                              isSelected
                                ? "default"
                                : "outline"
                            }
                            onClick={() =>
                              handleToggleWeeklyOff(
                                day.value
                              )
                            }
                            className={`justify-between text-left h-11 px-4 ${
                              isSelected
                                ? "bg-primary/20 hover:bg-primary/30 border-primary text-primary font-semibold"
                                : "hover:bg-muted/50 border-border text-foreground/75"
                            }`}
                          >
                            <span>
                              {day.label}
                            </span>

                            {isSelected && (
                              <CheckCircle className="w-4 h-4 text-primary" />
                            )}
                          </Button>
                        );
                      }
                    )}

                  </div>

                  <Button
                    onClick={
                      handleSaveWeeklyOffs
                    }
                    disabled={
                      isSavingWeeklyOffs
                    }
                    className="w-full shadow-lg shadow-primary/10"
                  >
                    {isSavingWeeklyOffs && (
                      <Spinner className="w-4 h-4 mr-2" />
                    )}

                    Save Weekly Offs
                  </Button>

                </CardContent>

              </Card>

              {/* Public Holidays */}
              <Card className="border border-border bg-card/40 backdrop-blur-md lg:col-span-2">

                <CardHeader>
                  <CardTitle className="text-lg font-bold">
                    Public Holidays
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">

                  <form
                    onSubmit={
                      handleAddHoliday
                    }
                    className="p-4 rounded-xl border border-border bg-muted/20 space-y-4"
                  >

                    <h4 className="text-sm font-semibold text-foreground">
                      Add New Public Holiday
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">
                          Holiday Name
                        </label>

                        <Input
                          required
                          placeholder="New Year's Day, Christmas, etc."
                          value={
                            newHolidayName
                          }
                          onChange={(e) =>
                            setNewHolidayName(
                              e.target.value
                            )
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">
                          Date
                        </label>

                        <Input
                          required
                          type="date"
                          value={
                            newHolidayDate
                          }
                          onChange={(e) =>
                            setNewHolidayDate(
                              e.target.value
                            )
                          }
                          className={DATE_INPUT_ICON_CLASS}
                        />
                      </div>

                    </div>

                    <div className="flex justify-end">

                      <Button
                        type="submit"
                        disabled={
                          isAddingHoliday
                        }
                        className="gap-2 shadow-sm"
                      >
                        {isAddingHoliday ? (
                          <Spinner className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}

                        Add Holiday
                      </Button>

                    </div>

                  </form>

                  <div className="space-y-4">

                    <h4 className="text-sm font-semibold text-foreground">
                      Configured Holidays
                    </h4>

                    {isLoadingSettings ? (

                      <div className="py-8 flex items-center justify-center">
                        <Spinner className="w-6 h-6" />
                      </div>

                    ) : holidays.length === 0 ? (

                      <div className="py-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                        No public holidays configured yet.
                      </div>

                    ) : (

                      <div className="border border-border rounded-xl overflow-hidden bg-card/20 max-h-[400px] overflow-y-auto">

                        <Table>

                          <TableHeader className="bg-muted/30">
                            <TableRow>

                              <TableHead>
                                Holiday Name
                              </TableHead>

                              <TableHead>
                                Date
                              </TableHead>

                              <TableHead className="w-16 text-right">
                                Action
                              </TableHead>

                            </TableRow>
                          </TableHeader>

                          <TableBody>

                            {holidays.map(
                              (h) => (

                                <TableRow
                                  key={h.id}
                                  className="hover:bg-muted/30 transition-colors"
                                >

                                  <TableCell className="font-semibold text-sm">
                                    {h.name}
                                  </TableCell>

                                  <TableCell className="text-sm font-mono text-muted-foreground">
                                    {new Date(
                                      h.date
                                    ).toLocaleDateString(
                                      "en-IN",
                                      {
                                        weekday:
                                          "short",
                                        year:
                                          "numeric",
                                        month:
                                          "short",
                                        day:
                                          "numeric",
                                        timeZone:
                                          "UTC",
                                      }
                                    )}
                                  </TableCell>

                                  <TableCell className="text-right">

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        handleDeleteHoliday(
                                          h.id
                                        )
                                      }
                                      className="h-8 w-8 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                      title="Delete Holiday"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>

                                  </TableCell>

                                </TableRow>
                              )
                            )}

                          </TableBody>

                        </Table>

                      </div>
                    )}

                  </div>

                </CardContent>

              </Card>

            </div>

          </TabsContent>
        )}

      </Tabs>

      {/* ====================================================== */}
      {/* EMPLOYEE DETAILS DRAWER */}
      {/* ====================================================== */}

      <Sheet
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      >

        <SheetContent className="sm:max-w-md overflow-y-auto bg-card border-l border-border">

          <SheetHeader>
            <SheetTitle>
              Employee Details
            </SheetTitle>

            <SheetDescription>
              Overview of employee administrative and financial metadata.
            </SheetDescription>
          </SheetHeader>

          {detailsEmp && (
            <div className="space-y-6 mt-6">

              {/* Profile */}
              <div className="flex items-center gap-4 min-w-0">

                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xl border border-primary/20 overflow-hidden shrink-0">

                  {detailsEmp.profilePhoto ? (
                    <img
                      src={
                        detailsEmp.profilePhoto
                      }
                      alt={
                        detailsEmp.fullName
                      }
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    detailsEmp.fullName
                      .charAt(0)
                      .toUpperCase()
                  )}

                </div>

                <div className="min-w-0">

                  <h3 className="text-lg font-bold text-foreground truncate">
                    {detailsEmp.fullName}
                  </h3>

                  <p className="text-sm text-muted-foreground truncate">
                    {detailsEmp.designation}{" "}
                    (
                    {
                      detailsEmp.department
                    }
                    )
                  </p>

                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {detailsEmp.employeeId}
                  </p>

                </div>

              </div>

              {/* HR Details */}
              <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">

                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                  HR & Professional Details
                </h4>

                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-3 text-xs">

                  <span className="font-semibold">
                    Type:
                  </span>

                  <span className="capitalize min-w-0 break-words">
                    {detailsEmp.employeeType}
                  </span>

                  <span className="font-semibold">
                    Gender:
                  </span>

                  <span className="capitalize min-w-0">
                    {detailsEmp.gender}
                  </span>

                  <span className="font-semibold">
                    Company Email:
                  </span>

                  <span className="min-w-0 break-all">
                    {detailsEmp.companyEmail}
                  </span>

                  <span className="font-semibold">
                    Personal Email:
                  </span>

                  <span className="min-w-0 break-all">
                    {detailsEmp.personalEmail}
                  </span>

                  <span className="font-semibold">
                    Contact:
                  </span>

                  <span className="break-words">
                    {detailsEmp.contactNumber}
                  </span>

                  <span className="font-semibold">
                    Emergency No:
                  </span>

                  <span className="break-words">
                    {detailsEmp.emergencyContactNumber}
                  </span>

                  <span className="font-semibold">
                    Address:
                  </span>

                  <span className="break-words">
                    {detailsEmp.address}
                  </span>

                  <span className="font-semibold">
                    Date of Birth:
                  </span>

                  <span>
                    {detailsEmp.dateOfBirth
                      ? new Date(
                          detailsEmp.dateOfBirth
                        ).toLocaleDateString()
                      : "—"}
                  </span>

                  <span className="font-semibold">
                    Joining Date:
                  </span>

                  <span>
                    {detailsEmp.joiningDate
                      ? new Date(
                          detailsEmp.joiningDate
                        ).toLocaleDateString()
                      : "—"}
                  </span>

                  <span className="font-semibold">
                    Reporting Manager:
                  </span>

                  <span className="break-words">
                    {detailsEmp.manager
                      ? `${
                          detailsEmp.manager
                            .name ||
                          detailsEmp.manager
                            .email
                        } (${
                          detailsEmp.manager
                            .email
                        })`
                      : "None (Direct Admin)"}
                  </span>

                </div>

              </div>

              {/* Bank Details */}
              <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">

                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                  Salary & Bank Details
                </h4>

                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-3 text-xs">

                  <span className="font-semibold">
                    Base Salary:
                  </span>

                  <span className="font-extrabold text-emerald-400">
                    {formatCurrency(
                      detailsEmp.salary
                    )}
                  </span>

                  <span className="font-semibold">
                    Bank Name:
                  </span>

                  <span className="break-words">
                    {
                      detailsEmp
                        .bankDetails
                        ?.bankName
                    }
                  </span>

                  <span className="font-semibold">
                    Account Number:
                  </span>

                  <span className="font-mono break-all">
                    {
                      detailsEmp
                        .bankDetails
                        ?.accountNumber
                    }
                  </span>

                  <span className="font-semibold">
                    IFSC Code:
                  </span>

                  <span className="font-mono break-all">
                    {
                      detailsEmp
                        .bankDetails
                        ?.ifscCode
                    }
                  </span>

                  <span className="font-semibold">
                    UPI ID:
                  </span>

                  <span className="font-mono break-all">
                    {
                      detailsEmp
                        .bankDetails
                        ?.upiId
                    }
                  </span>

                  <span className="font-semibold">
                    PAN Card:
                  </span>

                  <span className="font-mono uppercase break-all">
                    {
                      detailsEmp.panCardNumber
                    }
                  </span>

                  <span className="font-semibold">
                    Aadhaar Card:
                  </span>

                  <span className="font-mono break-all">
                    {
                      detailsEmp.aadhaarNumber
                    }
                  </span>

                </div>

              </div>

            </div>
          )}

        </SheetContent>

      </Sheet>

      {/* ====================================================== */}
      {/* ADD / EDIT EMPLOYEE MODAL */}
      {/* ====================================================== */}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">

          <motion.div
            initial={{
              opacity: 0,
              scale: 0.97,
              y: 10,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            transition={{
              duration: 0.2,
            }}
            className="
              bg-card
              border border-border
              rounded-2xl
              w-full
              max-w-4xl
              max-h-[94vh]
              overflow-hidden
              shadow-2xl
              flex flex-col
            "
          >

            {/* ================================================= */}
            {/* MODAL HEADER */}
            {/* ================================================= */}

            <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-border bg-card/95">

              <div className="flex items-center justify-between gap-4">

                <div className="min-w-0">

                  <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">
                    {isEditMode
                      ? "Edit Employee Details"
                      : "Add New Employee"}
                  </h2>

                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {isEditMode
                      ? "Update employee profile, employment and bank information."
                      : "Create a new employee profile with employment and bank information."}
                  </p>

                </div>

                <Badge
                  variant="outline"
                  className="
                    shrink-0
                    h-8
                    px-3
                    font-mono
                    text-xs
                    bg-muted/30
                    border-border
                  "
                >
                  Emp ID: {nextEmpId}
                </Badge>

              </div>

            </div>

            {/* ================================================= */}
            {/* FORM */}
            {/* ================================================= */}

            <form
              onSubmit={handleFormSubmit}
              className="flex-1 min-h-0 overflow-y-auto"
            >

              <div className="p-5 sm:p-6 space-y-7">

                {/* ============================================= */}
                {/* PERSONAL INFORMATION */}
                {/* ============================================= */}

                <section className="space-y-4">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-primary" />
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-foreground">
                        Personal Information
                      </h3>

                      <p className="text-xs text-muted-foreground">
                        Basic employee contact and identity information
                      </p>
                    </div>

                  </div>

                  <div className="h-px bg-border" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">

                    {/* Full Name */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Full Name
                      </label>

                      <Input
                        required
                        placeholder="Jane Doe"
                        value={fullName}
                        onChange={(e) =>
                          setFullName(
                            e.target.value.replace(/[^A-Za-z .'-]/g, "")
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* Personal Email */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Personal Email
                      </label>

                      <Input
                        required
                        type="email"
                        placeholder="jane@personal.com"
                        value={personalEmail}
                        onChange={(e) =>
                          setPersonalEmail(
                            e.target.value
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* Company Email */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Company Email
                      </label>

                      <Input
                        required
                        type="email"
                        placeholder="jane@company.com"
                        value={companyEmail}
                        onChange={(e) =>
                          setCompanyEmail(
                            e.target.value
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* Contact Number */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Contact Number
                      </label>

                      <Input
                        required
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="9988776655"
                        value={contactNumber}
                        onChange={(e) =>
                          setContactNumber(
                            e.target.value.replace(/\D/g, "").slice(0, 10)
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* Emergency */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Emergency Contact
                      </label>

                      <Input
                        required
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="9988776644"
                        value={emergencyContact}
                        onChange={(e) =>
                          setEmergencyContact(
                            e.target.value.replace(/\D/g, "").slice(0, 10)
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* PAN */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        PAN Card Number
                      </label>

                      <Input
                        required
                        maxLength={10}
                        placeholder="ABCDE1234F"
                        value={panCard}
                        onChange={(e) =>
                          setPanCard(
                            e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9]/g, "")
                              .slice(0, 10)
                          )
                        }
                        className="h-10 uppercase"
                      />

                    </div>

                    {/* Aadhaar */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Aadhaar Number
                      </label>

                      <Input
                        required
                        inputMode="numeric"
                        maxLength={12}
                        placeholder="123456789012"
                        value={aadhaar}
                        onChange={(e) =>
                          setAadhaar(
                            e.target.value.replace(/\D/g, "").slice(0, 12)
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* DOB */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Date of Birth
                      </label>

                      <Input
                        required
                        type="date"
                        value={dob}
                        onChange={(e) =>
                          setDob(
                            e.target.value
                          )
                        }
                        className={`h-10 w-full min-w-0 ${DATE_INPUT_ICON_CLASS}`}
                      />

                    </div>

                    {/* Joining Date */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Joining Date
                      </label>

                      <Input
                        required
                        type="date"
                        value={joiningDate}
                        onChange={(e) =>
                          setJoiningDate(
                            e.target.value
                          )
                        }
                        className={`h-10 w-full min-w-0 ${DATE_INPUT_ICON_CLASS}`}
                      />

                    </div>

                    {/* Gender */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Gender
                      </label>

                      <Select
                        value={gender}
                        onValueChange={
                          setGender
                        }
                      >

                        <SelectTrigger className="h-10 w-full min-w-0">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>

                        <SelectContent>

                          <SelectItem value="male">
                            Male
                          </SelectItem>

                          <SelectItem value="female">
                            Female
                          </SelectItem>

                          <SelectItem value="other">
                            Other
                          </SelectItem>

                        </SelectContent>

                      </Select>

                    </div>

                  </div>

                </section>

                {/* ============================================= */}
                {/* EMPLOYMENT */}
                {/* ============================================= */}

                <section className="space-y-4">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Briefcase className="w-4 h-4 text-blue-400" />
                    </div>

                    <div>

                      <h3 className="text-sm font-bold text-foreground">
                        Employment Information
                      </h3>

                      <p className="text-xs text-muted-foreground">
                        Department, designation, role and salary information
                      </p>

                    </div>

                  </div>

                  <div className="h-px bg-border" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">

                    {/* Department */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Department
                      </label>

                      <Input
                        required
                        placeholder="Engineering"
                        value={department}
                        onChange={(e) =>
                          setDepartment(
                            e.target.value
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* Designation */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Designation
                      </label>

                      <Input
                        required
                        placeholder="Software Engineer"
                        value={designation}
                        onChange={(e) =>
                          setDesignation(
                            e.target.value
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* Employee Type */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Employee Type
                      </label>

                      <Select
                        value={empType}
                        onValueChange={
                          setEmpType
                        }
                      >

                        <SelectTrigger className="h-10 w-full min-w-0">
                          <SelectValue placeholder="Select employee type" />
                        </SelectTrigger>

                        <SelectContent>

                          <SelectItem value="intern">
                            Intern
                          </SelectItem>

                          <SelectItem value="permanent">
                            Permanent
                          </SelectItem>

                          <SelectItem value="freelance">
                            Freelance
                          </SelectItem>

                          <SelectItem value="partner">
                            Partner
                          </SelectItem>

                          <SelectItem value="other">
                            Other
                          </SelectItem>

                        </SelectContent>

                      </Select>

                    </div>

                    {/* System Role */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        System Role
                      </label>

                      <Select
                        value={empRoleId}
                        onValueChange={
                          setEmpRoleId
                        }
                      >

                        <SelectTrigger className="h-10 w-full min-w-0">
                          <SelectValue placeholder="Select system role" />
                        </SelectTrigger>

                        <SelectContent>

                          <SelectItem value="3">
                            Developer (3)
                          </SelectItem>

                          <SelectItem value="4">
                            Designer (4)
                          </SelectItem>

                          <SelectItem value="5">
                            Manager (5)
                          </SelectItem>

                          <SelectItem value="7">
                            Supporter (7)
                          </SelectItem>

                          <SelectItem value="1">
                            Admin (1)
                          </SelectItem>

                        </SelectContent>

                      </Select>

                    </div>

                    {/* Salary */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Salary (Monthly INR)
                      </label>

                      {isAdmin ? (
                        <Input
                          required
                          type="number"
                          min="0"
                          placeholder="50000"
                          value={salary}
                          onChange={(e) =>
                            setSalary(
                              e.target.value.replace(/[^0-9.]/g, "")
                            )
                          }
                          className="h-10"
                        />
                      ) : (
                        <Input
                          disabled
                          placeholder="Restricted"
                          value={salary}
                          className="h-10"
                        />
                      )}

                    </div>

                    {/* Address */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Address
                      </label>

                      <Input
                        required
                        placeholder="456 Silicon Street, Sector 4, Bangalore"
                        value={address}
                        onChange={(e) =>
                          setAddress(
                            e.target.value
                          )
                        }
                        className="h-10"
                      />

                    </div>

                  </div>

                </section>

                {/* ============================================= */}
                {/* ACCOUNT & REPORTING */}
                {/* ============================================= */}

                <section className="space-y-4">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <UserCheck className="w-4 h-4 text-violet-400" />
                    </div>

                    <div>

                      <h3 className="text-sm font-bold text-foreground">
                        Account & Reporting
                      </h3>

                      <p className="text-xs text-muted-foreground">
                        Connect workspace account and reporting manager
                      </p>

                    </div>

                  </div>

                  <div className="h-px bg-border" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    {/* USER ACCOUNT */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Workspace User Login Account
                      </label>

                      <Select
                        value={
                          linkUserId ||
                          "none"
                        }
                        onValueChange={(
                          val
                        ) =>
                          setLinkUserId(
                            val ===
                              "none"
                              ? ""
                              : val
                          )
                        }
                      >

                        <SelectTrigger className="h-11 w-full min-w-0 overflow-hidden">

                          <SelectValue
                            placeholder="Select login account"
                            className="truncate"
                          />

                        </SelectTrigger>

                        <SelectContent className="max-w-[min(90vw,500px)]">

                          <SelectItem
                            value="none"
                            className="max-w-full"
                          >

                            <span className="block max-w-[400px] truncate">
                              Do Not Link (Offline profile)
                            </span>

                          </SelectItem>

                          {availableUsers.map(
                            (u) => (

                              <SelectItem
                                key={u.id}
                                value={u.id}
                                className="max-w-full"
                              >

                                <span className="block max-w-[400px] truncate">

                                  {u.name ||
                                    u.email}

                                  {u.email
                                    ? ` (${u.email})`
                                    : ""}

                                </span>

                              </SelectItem>

                            )
                          )}

                        </SelectContent>

                      </Select>

                      <p className="text-[11px] text-muted-foreground">
                        Connect this employee with an existing workspace user.
                      </p>

                    </div>

                    {/* MANAGER */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Reporting Manager
                      </label>

                      <Select
                        value={
                          linkManagerId ||
                          "none"
                        }
                        onValueChange={(
                          val
                        ) =>
                          setLinkManagerId(
                            val ===
                              "none"
                              ? ""
                              : val
                          )
                        }
                      >

                        <SelectTrigger className="h-11 w-full min-w-0 overflow-hidden">

                          <SelectValue
                            placeholder="Select reporting manager"
                            className="truncate"
                          />

                        </SelectTrigger>

                        <SelectContent className="max-w-[min(90vw,500px)]">

                          <SelectItem
                            value="none"
                            className="max-w-full"
                          >

                            <span className="block max-w-[400px] truncate">
                              No Manager (Direct Admin reporting)
                            </span>

                          </SelectItem>

                          {availableUsers
                            .filter(
                              (u) =>
                                !linkUserId ||
                                u.id !==
                                  linkUserId
                            )
                            .map(
                              (u) => (

                                <SelectItem
                                  key={u.id}
                                  value={u.id}
                                  className="max-w-full"
                                >

                                  <span className="block max-w-[400px] truncate">

                                    {u.name ||
                                      u.email}

                                    {u.email
                                      ? ` (${u.email})`
                                      : ""}

                                  </span>

                                </SelectItem>

                              )
                            )}

                        </SelectContent>

                      </Select>

                      <p className="text-[11px] text-muted-foreground">
                        Select the manager responsible for attendance and approvals.
                      </p>

                    </div>

                  </div>

                </section>

                {/* ============================================= */}
                {/* BANK DETAILS */}
                {/* ============================================= */}

                <section className="space-y-4">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                    </div>

                    <div>

                      <h3 className="text-sm font-bold text-foreground">
                        Employee Bank Details
                      </h3>

                      <p className="text-xs text-muted-foreground">
                        Banking information used for payroll processing
                      </p>

                    </div>

                  </div>

                  <div className="h-px bg-border" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">

                    {/* BANK */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Bank Name
                      </label>

                      <Input
                        required
                        placeholder="HDFC Bank"
                        value={bankName}
                        onChange={(e) =>
                          setBankName(
                            e.target.value.replace(/[^A-Za-z .&'-]/g, "")
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* ACCOUNT NUMBER */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Account Number
                      </label>

                      <Input
                        required
                        inputMode="numeric"
                        maxLength={18}
                        placeholder="5010022334455"
                        value={
                          accountNumber
                        }
                        onChange={(e) =>
                          setAccountNumber(
                            e.target.value.replace(/\D/g, "").slice(0, 18)
                          )
                        }
                        className="h-10 font-mono"
                      />

                    </div>

                    {/* IFSC */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        IFSC Code
                      </label>

                      <Input
                        required
                        maxLength={11}
                        placeholder="HDFC0000123"
                        value={ifscCode}
                        onChange={(e) =>
                          setIfscCode(
                            e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9]/g, "")
                              .slice(0, 11)
                          )
                        }
                        className="h-10 uppercase font-mono"
                      />

                    </div>

                    {/* UPI */}
                    <div className="space-y-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        UPI ID
                        <span className="ml-1 text-[10px] font-normal">
                          (Optional)
                        </span>
                      </label>

                      <Input
                        placeholder="name@upi"
                        value={upiId}
                        onChange={(e) =>
                          setUpiId(
                            e.target.value
                              .replace(/\s/g, "")
                              .slice(0, 100)
                          )
                        }
                        className="h-10"
                      />

                    </div>

                    {/* PROFILE IMAGE */}
                    <div className="space-y-2 md:col-span-2 min-w-0">

                      <label className="text-xs font-semibold text-muted-foreground">
                        Profile Image Link
                        <span className="ml-1 text-[10px] font-normal">
                          (Optional)
                        </span>
                      </label>

                      <Input
                        placeholder="https://example.com/profile.jpg"
                        value={
                          profilePhoto
                        }
                        onChange={(e) =>
                          setProfilePhoto(
                            e.target.value
                          )
                        }
                        className="h-10"
                      />

                      <p className="text-[11px] text-muted-foreground">
                        Enter a publicly accessible image URL.
                      </p>

                    </div>

                  </div>

                </section>

              </div>

              {/* ================================================= */}
              {/* MODAL FOOTER */}
              {/* ================================================= */}

              <div
                className="
                  sticky
                  bottom-0
                  z-10
                  px-5 sm:px-6
                  py-4
                  border-t
                  border-border
                  bg-card/95
                  backdrop-blur-md
                  flex
                  flex-col-reverse
                  sm:flex-row
                  sm:justify-end
                  gap-2
                "
              >

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setIsFormOpen(false)
                  }
                  className="w-full sm:w-auto min-w-[100px]"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  className="w-full sm:w-auto min-w-[120px] shadow-lg shadow-primary/20"
                >
                  {isEditMode
                    ? "Save Changes"
                    : "Create Employee"}
                </Button>

              </div>

            </form>

          </motion.div>

        </div>
      )}

      {/* ====================================================== */}
      {/* PAYROLL PREVIEW MODAL */}
      {/* ====================================================== */}

      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">

          <motion.div
            initial={{
              opacity: 0,
              scale: 0.95,
            }}
            animate={{
              opacity: 1,
              scale: 1,
            }}
            className="bg-card border border-border rounded-xl w-full max-w-4xl shadow-2xl p-6 flex flex-col max-h-[90vh]"
          >

            <div className="flex items-center justify-between border-b border-border pb-4 mb-4 gap-4">

              <div className="min-w-0">

                <h3 className="text-xl font-bold text-foreground">
                  Payroll Calculation Preview
                </h3>

                <p className="text-sm text-muted-foreground mt-0.5">
                  Review calculated leave deductions and final payable salary for all active employees.
                </p>

              </div>

              <button
                onClick={() =>
                  setIsPreviewOpen(false)
                }
                className="shrink-0 text-muted-foreground hover:text-foreground text-sm font-bold bg-muted/30 w-7 h-7 rounded-full flex items-center justify-center"
              >
                ×
              </button>

            </div>

            <div className="flex-1 overflow-auto mb-4 border border-border rounded-lg bg-card/20">

              {previewData.length === 0 ? (

                <div className="p-8 text-center text-muted-foreground italic">
                  No active employees available for preview.
                </div>

              ) : (

                <Table>

                  <TableHeader className="bg-muted/30 sticky top-0 z-10">

                    <TableRow>

                      <TableHead>
                        Employee Name
                      </TableHead>

                      <TableHead>
                        Monthly Salary
                      </TableHead>

                      <TableHead className="text-center">
                        Present
                      </TableHead>

                      <TableHead className="text-center">
                        Absent
                      </TableHead>

                      <TableHead className="text-center">
                        Approved Leaves
                      </TableHead>

                      <TableHead className="text-center">
                        Half Days
                      </TableHead>

                      <TableHead className="text-center">
                        Total Leave Taken
                      </TableHead>

                      <TableHead className="text-center">
                        Allowed Leaves
                      </TableHead>

                      <TableHead className="text-center">
                        Excess Leaves
                      </TableHead>

                      <TableHead>
                        Deduction Amount
                      </TableHead>

                      <TableHead>
                        Final Payable Salary
                      </TableHead>

                    </TableRow>

                  </TableHeader>

                  <TableBody>

                    {previewData.map(
                      (item) => (

                        <TableRow
                          key={
                            item.employeeId
                          }
                          className="hover:bg-muted/30 transition-colors"
                        >

                          <TableCell className="font-semibold text-sm">

                            <div>
                              <p>
                                {item.fullName}
                              </p>

                              <p className="text-xs text-muted-foreground font-mono">
                                {
                                  item.employeeCode
                                }
                              </p>
                            </div>

                          </TableCell>

                          <TableCell className="text-sm">
                            {formatCurrency(
                              item.salary
                            )}
                          </TableCell>

                          <TableCell className="text-sm font-mono text-center">
                            {item.presentDays ??
                              0}{" "}
                            d
                          </TableCell>

                          <TableCell className="text-sm font-mono text-center text-rose-500 font-semibold">
                            {item.absentDays ??
                              0}{" "}
                            d
                          </TableCell>

                          <TableCell className="text-sm font-mono text-center text-blue-400">
                            {item.approvedLeaves ??
                              0}{" "}
                            d
                          </TableCell>

                          <TableCell className="text-sm font-mono text-center text-amber-500">
                            {item.halfDays ??
                              0}{" "}
                            d
                          </TableCell>

                          <TableCell className="text-sm font-mono text-center font-bold">
                            {item.leavesTaken ??
                              0}{" "}
                            d
                          </TableCell>

                          <TableCell className="text-sm font-mono text-center">
                            {
                              item.allowedLeaves
                            }
                          </TableCell>

                          <TableCell className="text-sm font-mono text-center text-amber-500 font-semibold">
                            {
                              item.excessLeaves
                            }
                          </TableCell>

                          <TableCell className="text-sm font-semibold text-rose-400">
                            {item.deductionAmount >
                            0
                              ? `-${formatCurrency(
                                  item.deductionAmount
                                )}`
                              : "—"}
                          </TableCell>

                          <TableCell className="text-sm font-extrabold text-emerald-400">
                            {formatCurrency(
                              item.finalPayableSalary
                            )}
                          </TableCell>

                        </TableRow>

                      )
                    )}

                  </TableBody>

                </Table>

              )}

            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-border pt-4">

              <Button
                variant="outline"
                onClick={() =>
                  setIsPreviewOpen(false)
                }
              >
                Cancel & Review
              </Button>

              <Button
                onClick={
                  handleGeneratePayroll
                }
                disabled={
                  isLoadingPayroll
                }
                className="shadow-lg shadow-primary/10 gap-2"
              >

                {isLoadingPayroll ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}

                Confirm & Run Payroll

              </Button>

            </div>

          </motion.div>

        </div>
      )}

    </div>
  );
}
