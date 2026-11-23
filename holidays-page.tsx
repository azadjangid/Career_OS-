"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Copy,
  CheckCircle,
  AlertCircle,
  Search,
  Calendar,
  List,
  Sparkles,
  ChevronRight,
  MapPin,
  Building,
  Info,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { api, getApiUrl, getAccessToken } from "@/services/api-client";
import { useAuth } from "@/contexts/auth-store";

const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getHolidayTypeStyle(type: string) {
  switch (type.toLowerCase()) {
    case "national":
      return "bg-violet-500/10 text-violet-400 border border-violet-500/20";
    case "festival":
      return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
    case "company":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    case "regional":
      return "bg-sky-500/10 text-sky-400 border border-sky-500/20";
    case "optional":
      return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
    case "special_event":
      return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
    case "emergency":
      return "bg-red-500/10 text-red-400 border border-red-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Date input with a visible white calendar icon. Clicking the icon (or the field) opens the
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
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-white/80 transition-colors"
      >
        <CalendarDays className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function HolidaysPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 1;

  const [calendars, setCalendars] = useState<any[]>([]);
  const [selectedCalId, setSelectedCalId] = useState("");
  const [holidays, setHolidays] = useState<any[]>([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  const [activeTab, setActiveTab] = useState("list-view");

  // Widgets states
  const [widgets, setWidgets] = useState<any>({
    upcomingHolidays: [],
    currentMonthCount: 0,
    currentMonthList: [],
    stats: { total: 0, paid: 0, unpaid: 0, types: {} },
    nextFestival: null,
  });

  // Modal States
  const [isHolidayFormOpen, setIsHolidayFormOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedHolidayId, setSelectedHolidayId] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayType, setHolidayType] = useState("festival");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayDesc, setHolidayDesc] = useState("");
  const [holidayLoc, setHolidayLoc] = useState("All");
  const [holidayDepts, setHolidayDepts] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [isRecurring, setIsRecurring] = useState(false);
  const [formError, setFormError] = useState("");

  // Year Selection for Calendar Creation
  const [isCreateCalOpen, setIsCreateCalOpen] = useState(false);
  const [createYear, setCreateYear] = useState(String(new Date().getFullYear()));

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [actionLoading, setActionLoading] = useState<
    "copy" | "import" | "csv" | "pdf" | "publish" | null
  >(null);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [selectedHolidayDetails, setSelectedHolidayDetails] = useState<any>(null);

  const selectedCalendar = useMemo(() => {
    return calendars.find(c => c.id === selectedCalId);
  }, [calendars, selectedCalId]);

  const fetchCalendars = useCallback(async () => {
    try {
      const data = await api.get("/holiday-calendars");
      const calendarList = Array.isArray(data) ? data : [];

      setCalendars(calendarList);

      if (calendarList.length === 0) {
        setSelectedCalId("");
        setHolidays([]);
        setIsLoadingHolidays(false);
        return;
      }

      setSelectedCalId((currentSelectedId) => {
        const selectedStillExists = calendarList.some(
          (calendar: any) => calendar.id === currentSelectedId
        );

        if (selectedStillExists) {
          return currentSelectedId;
        }

        const currentYear = new Date().getFullYear();
        const currentYearCalendar = calendarList.find(
          (calendar: any) => Number(calendar.year) === currentYear
        );

        return currentYearCalendar?.id ?? calendarList[0].id;
      });
    } catch (error) {
      console.error("Failed to load calendars:", error);
      setCalendars([]);
      setSelectedCalId("");
      setHolidays([]);
      setIsLoadingHolidays(false);
    }
  }, []);

  const fetchHolidays = useCallback(
    async (calendarId: string) => {
      if (!calendarId) {
        setHolidays([]);
        setIsLoadingHolidays(false);
        return;
      }

      setIsLoadingHolidays(true);

      try {
        const roleQuery =
          user?.role !== undefined
            ? `?userRole=${encodeURIComponent(String(user.role))}`
            : "";

        const data = await api.get(
          `/holiday-calendars/${calendarId}/holidays${roleQuery}`
        );

        setHolidays(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load holidays:", error);
        setHolidays([]);
      } finally {
        setIsLoadingHolidays(false);
      }
    },
    [user?.role]
  );

  const fetchWidgets = useCallback(async () => {
    try {
      const data = await api.get("/holiday-calendars/dashboard-widgets");

      setWidgets({
        upcomingHolidays: Array.isArray(data?.upcomingHolidays)
          ? data.upcomingHolidays
          : [],
        currentMonthCount: Number(data?.currentMonthCount ?? 0),
        currentMonthList: Array.isArray(data?.currentMonthList)
          ? data.currentMonthList
          : [],
        stats: {
          total: Number(data?.stats?.total ?? 0),
          paid: Number(data?.stats?.paid ?? 0),
          unpaid: Number(data?.stats?.unpaid ?? 0),
          types: data?.stats?.types ?? {},
        },
        nextFestival: data?.nextFestival ?? null,
      });
    } catch (error) {
      console.error("Failed to load widgets:", error);
      setWidgets({
        upcomingHolidays: [],
        currentMonthCount: 0,
        currentMonthList: [],
        stats: { total: 0, paid: 0, unpaid: 0, types: {} },
        nextFestival: null,
      });
    }
  }, []);

  useEffect(() => {
    void fetchCalendars();
    void fetchWidgets();
  }, [fetchCalendars, fetchWidgets]);

  useEffect(() => {
    if (!selectedCalId) {
      setHolidays([]);
      setIsLoadingHolidays(false);
      return;
    }

    void fetchHolidays(selectedCalId);
  }, [selectedCalId, fetchHolidays]);

  const handleCreateCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cal = await api.post("/holiday-calendars", { year: Number(createYear) });
      setIsCreateCalOpen(false);
      setSelectedCalId(cal.id);
      fetchCalendars();
    } catch (err: any) {
      alert(err.message || "Failed to create calendar");
    }
  };

  const handlePublishCalendar = async () => {
    if (!selectedCalId || actionLoading) return;
    if (!confirm("Are you sure you want to publish this yearly holiday calendar? Once published, employees will see these holidays on their calendars.")) return;

    setActionLoading("publish");
    try {
      await api.post(`/holiday-calendars/${selectedCalId}/publish`);
      await fetchCalendars();
      alert("Calendar published successfully.");
    } catch (err: any) {
      alert(err?.message || "Failed to publish calendar");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyPreviousYear = async () => {
    if (!selectedCalId || !selectedCalendar || actionLoading) return;
    if (!confirm(`Do you want to copy all holidays from the calendar year ${selectedCalendar.year - 1}?`)) return;

    setActionLoading("copy");
    try {
      await api.post(`/holiday-calendars/${selectedCalId}/copy-previous`);
      await Promise.all([fetchHolidays(selectedCalId), fetchWidgets()]);
      alert("Previous year's holidays copied successfully.");
    } catch (err: any) {
      alert(err?.message || "Failed to copy previous calendar");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddHolidaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const payload = {
      name: holidayName,
      type: holidayType,
      date: holidayDate,
      description: holidayDesc || undefined,
      location: holidayLoc,
      departments: holidayDepts || undefined,
      isPaid,
      isRecurring,
    };

    try {
      if (isEditMode && selectedHolidayId) {
        await api.put(`/holiday-calendars/${selectedCalId}/holidays/${selectedHolidayId}`, payload);
      } else {
        await api.post(`/holiday-calendars/${selectedCalId}/holidays`, payload);
      }
      setIsHolidayFormOpen(false);
      fetchHolidays(selectedCalId);
      fetchWidgets();
    } catch (err: any) {
      setFormError(err.message || "Failed to save holiday");
    }
  };

  const handleOpenEditHoliday = (h: any) => {
    setIsEditMode(true);
    setSelectedHolidayId(h.id);
    setHolidayName(h.name);
    setHolidayType(h.type);
    setHolidayDate(h.date.split("T")[0]);
    setHolidayDesc(h.description || "");
    setHolidayLoc(h.location);
    setHolidayDepts(h.departments || "");
    setIsPaid(h.isPaid);
    setIsRecurring(h.isRecurring);
    setIsHolidayFormOpen(true);
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    if (!confirm("Are you sure you want to delete this holiday?")) return;
    try {
      await api.delete(`/holiday-calendars/${selectedCalId}/holidays/${holidayId}`);
      fetchHolidays(selectedCalId);
      fetchWidgets();
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    }
  };

  const handleImportFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setImportError("");

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "csv" && extension !== "json") {
      setImportError("Only .csv and .json files are supported.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImportError("File size must be 5 MB or less.");
      return;
    }

    try {
      const text = await file.text();
      if (!text.trim()) {
        setImportError("The selected file is empty.");
        return;
      }

      if (extension === "json") {
        JSON.parse(text);
      }

      setImportFormat(extension);
      setImportText(text);
      setImportFileName(file.name);
    } catch (error) {
      console.error("Failed to read import file:", error);
      setImportError(
        extension === "json"
          ? "The selected JSON file is not valid."
          : "Could not read the selected file."
      );
    }
  };

  const clearImportFile = () => {
    setImportText("");
    setImportFileName("");
    setImportError("");
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCalId) {
      setImportError("Select a calendar year before importing holidays.");
      return;
    }

    if (!importText.trim()) {
      setImportError("Choose a CSV/JSON file or paste the import data.");
      return;
    }

    setImportError("");
    setActionLoading("import");

    try {
      if (importFormat === "json") {
        JSON.parse(importText);
      }

      await api.post(`/holiday-calendars/${selectedCalId}/import`, {
        text: importText,
        format: importFormat,
      });

      await Promise.all([fetchHolidays(selectedCalId), fetchWidgets()]);
      setIsImportOpen(false);
      clearImportFile();
      alert("Holidays imported successfully.");
    } catch (err: any) {
      setImportError(err?.message || "Failed to import holiday file.");
    } finally {
      setActionLoading(null);
    }
  };

  const downloadExportFile = async (format: "csv" | "pdf") => {
    if (!selectedCalId || actionLoading) return;

    setActionLoading(format);

    try {
      const token = getAccessToken();
      const response = await fetch(
        getApiUrl(`/holiday-calendars/${selectedCalId}/export/${format}`),
        {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: "include",
        }
      );

      if (!response.ok) {
        let message = `Failed to export ${format.toUpperCase()}`;
        try {
          const errorBody = await response.json();
          const apiMessage = errorBody?.message;
          message = Array.isArray(apiMessage)
            ? apiMessage.join(", ")
            : apiMessage || message;
        } catch {
          // The response may not contain JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("The exported file is empty.");
      }

      const disposition = response.headers.get("content-disposition") || "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const normalName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      const fallbackName = `holiday-calendar-${selectedCalendar?.year ?? "export"}.${format}`;
      const fileName = decodeURIComponent(encodedName || normalName || fallbackName);

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      alert(err?.message || `Failed to export ${format.toUpperCase()} file.`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportCSV = () => void downloadExportFile("csv");
  const handleExportPDF = () => void downloadExportFile("pdf");

  const openAddForm = () => {
    setIsEditMode(false);
    setSelectedHolidayId("");
    setHolidayName("");
    setHolidayType("festival");
    setHolidayDate("");
    setHolidayDesc("");
    setHolidayLoc("All");
    setHolidayDepts("");
    setIsPaid(true);
    setIsRecurring(false);
    setIsHolidayFormOpen(true);
  };

  const filteredHolidays = useMemo(() => {
    return holidays.filter(h => {
      const matchSearch = h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (h.description && h.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchType = typeFilter === "all" || h.type.toLowerCase() === typeFilter.toLowerCase();
      return matchSearch && matchType;
    });
  }, [holidays, searchQuery, typeFilter]);

  // Calendar rendering math helper
  const getMonthDays = (year: number, monthIdx: number) => {
    const firstDay = new Date(year, monthIdx, 1).getDay();
    const totalDays = new Date(year, monthIdx + 1, 0).getDate();
    const daysArr = [];
    for (let i = 0; i < firstDay; i++) daysArr.push(null);
    for (let i = 1; i <= totalDays; i++) {
      daysArr.push(new Date(Date.UTC(year, monthIdx, i)));
    }
    return daysArr;
  };

  const holidayDateMap = useMemo(() => {
    const map: Record<string, any> = {};
    holidays.forEach(h => {
      const d = new Date(h.date);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      map[key] = h;
    });
    return map;
  }, [holidays]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Countdown Alert Banner */}
      {widgets.nextFestival && (
        <div className="p-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl flex items-center justify-between text-amber-300 font-semibold animate-pulse shadow-md">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span>Next Festival: <strong className="text-white font-extrabold">{widgets.nextFestival.name}</strong> is in <strong className="text-amber-400 font-extrabold">{widgets.nextFestival.daysRemaining}</strong> day(s)!</span>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-white" />
                Date: {new Date(widgets.nextFestival.date).toLocaleDateString("en-IN", { timeZone: "UTC", dateStyle: "long" })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <CalendarDays className="w-8 h-8 text-primary" />
            Holiday & Festival Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            Create yearly calendars, publish official company holidays, and setup custom notifications.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Calendar Year Selector */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Year:</span>
            <Select value={selectedCalId} onValueChange={setSelectedCalId}>
              <SelectTrigger className="w-[110px]">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((cal) => (
                  <SelectItem key={cal.id} value={cal.id}>
                    {cal.year} {!cal.isPublished && "(Unpub)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIsCreateCalOpen(true)}>
                <Plus className="w-4 h-4" /> Add Year
              </Button>
              {selectedCalendar && !selectedCalendar.isPublished && (
                <Button size="sm" variant="default" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold gap-1.5" onClick={handlePublishCalendar}>
                  <CheckCircle className="w-4 h-4" /> Publish
                </Button>
              )}
              {selectedCalendar && (
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      Actions <ChevronRight className="w-3 h-3 rotate-90" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-popover border border-border" align="end">
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleCopyPreviousYear} disabled={actionLoading !== null}>
                      {actionLoading === "copy" ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Copy className="w-4 h-4 text-indigo-400" />}
                      Copy Previous Calendar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setImportError(""); setIsImportOpen(true); }} disabled={actionLoading !== null}>
                      <Upload className="w-4 h-4 text-emerald-400" /> Import CSV/JSON File
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleExportCSV} disabled={actionLoading !== null}>
                      {actionLoading === "csv" ? <Loader2 className="w-4 h-4 animate-spin text-sky-400" /> : <Download className="w-4 h-4 text-sky-400" />}
                      Export CSV (Excel)
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleExportPDF} disabled={actionLoading !== null}>
                      {actionLoading === "pdf" ? <Loader2 className="w-4 h-4 animate-spin text-rose-400" /> : <Download className="w-4 h-4 text-rose-400" />}
                      Export PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Holidays</p>
                <h3 className="text-2xl font-bold mt-1">{widgets.stats.total}</h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <CalendarDays className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paid / Unpaid</p>
                <h3 className="text-xl font-bold mt-1 text-emerald-400">{widgets.stats.paid} Paid <span className="text-xs text-muted-foreground">/ {widgets.stats.unpaid} Unpaid</span></h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month's Holidays</p>
                <h3 className="text-2xl font-bold mt-1 text-sky-400">{widgets.currentMonthCount}</h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400">
                <Calendar className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Holidays widget list */}
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Next 3 Holidays</p>
            <div className="space-y-1.5">
              {widgets.upcomingHolidays.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No upcoming holidays</p>
              ) : (
                widgets.upcomingHolidays.map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between text-xs border-b border-border/50 pb-1 last:border-0 last:pb-0">
                    <span className="font-semibold truncate max-w-[120px] text-foreground/90" title={h.name}>{h.name}</span>
                    <span className="font-mono text-muted-foreground text-[10px]">in {h.countdown}d</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <TabsList className="bg-muted/50 p-1 border border-border">
            <TabsTrigger value="list-view" className="gap-2">
              <List className="w-4 h-4" /> List Table View
            </TabsTrigger>
            <TabsTrigger value="calendar-grid" className="gap-2">
              <Calendar className="w-4 h-4" /> Yearly Grid View
            </TabsTrigger>
          </TabsList>

          {activeTab === "list-view" && (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search holidays..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="national">National</SelectItem>
                  <SelectItem value="festival">Festival</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="regional">Regional</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                  <SelectItem value="special_event">Special Event</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isAdmin && selectedCalendar && (
            <Button onClick={openAddForm} className="shadow-md shadow-primary/15 gap-2 shrink-0">
              <Plus className="w-4 h-4" /> Add Holiday
            </Button>
          )}
        </div>

        {/* Tab 1: List View */}
        <TabsContent value="list-view" className="outline-none space-y-4">
          <Card className="border border-border bg-card/40 backdrop-blur-md">
            <CardContent className="p-0">
              {isLoadingHolidays ? (
                <div className="p-16 flex items-center justify-center">
                  <Spinner className="w-8 h-8" />
                </div>
              ) : filteredHolidays.length === 0 ? (
                <div className="p-16 text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2" />
                  No holidays match current query or filter filters.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Holiday Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Paid?</TableHead>
                      <TableHead>Recurring?</TableHead>
                      {isAdmin && <TableHead className="w-20 text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHolidays.map((h) => (
                      <TableRow key={h.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-semibold text-sm">
                          <button
                            onClick={() => setSelectedHolidayDetails(h)}
                            className="hover:underline text-left text-foreground font-bold hover:text-primary transition-colors cursor-pointer"
                          >
                            {h.name}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5 text-white shrink-0" />
                            <span>
                              {new Date(h.date).toLocaleDateString("en-IN", {
                                weekday: "short",
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize font-mono text-[10px] px-2 py-0.5 rounded-full ${getHolidayTypeStyle(h.type)}`}>
                            {h.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span>{h.location}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge variant={h.isPaid ? "outline" : "secondary"} className={h.isPaid ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground"}>
                            {h.isPaid ? "Paid" : "Unpaid"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="secondary" className="bg-muted text-muted-foreground font-semibold">
                            {h.isRecurring ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleOpenEditHoliday(h)} className="h-8 w-8 text-indigo-400 hover:bg-indigo-500/10">
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteHoliday(h.id)} className="h-8 w-8 text-rose-400 hover:bg-rose-500/10">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Yearly Grid View */}
        <TabsContent value="calendar-grid" className="outline-none space-y-6">
          {isLoadingHolidays ? (
            <div className="p-24 flex items-center justify-center">
              <Spinner className="w-10 h-10" />
            </div>
          ) : holidays.length === 0 ? (
            <div className="p-24 text-center border border-dashed border-border rounded-2xl bg-card/10">
              <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground/60 mb-2" />
              <h4 className="font-semibold text-foreground">No Holidays Found</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Configure this year's holidays by copy cloning previous calendar data, importing files, or adding custom holiday details.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {MONTHS.map((monthName, mIdx) => {
                const yearNum = selectedCalendar ? selectedCalendar.year : new Date().getFullYear();
                const days = getMonthDays(yearNum, mIdx);

                return (
                  <Card key={monthName} className="border border-border bg-card/30 backdrop-blur-md overflow-hidden select-none hover:border-border/80 transition-colors">
                    <CardHeader className="p-3 bg-muted/40 border-b border-border text-center">
                      <CardTitle className="text-sm font-bold text-foreground">{monthName}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
                      {/* Short weekdays row */}
                      <div className="grid grid-cols-7 mb-1 text-center">
                        {DAYS_SHORT.map(wd => (
                          <span key={wd} className="text-[10px] font-bold text-muted-foreground">{wd}</span>
                        ))}
                      </div>

                      {/* Cells */}
                      <div className="grid grid-cols-7 gap-1 text-center">
                        {days.map((dateObj, dIdx) => {
                          if (!dateObj) {
                            return <span key={`empty-${dIdx}`} className="h-6 w-6 block" />;
                          }

                          const dayNum = dateObj.getUTCDate();
                          const dateKeyStr = `${dateObj.getUTCFullYear()}-${dateObj.getUTCMonth()}-${dateObj.getUTCDate()}`;
                          const holiday = holidayDateMap[dateKeyStr];

                          return (
                            <button
                              key={dateKeyStr}
                              onClick={() => holiday && setSelectedHolidayDetails(holiday)}
                              className={`h-6 w-6 text-[10px] font-semibold rounded-full flex items-center justify-center transition-all ${
                                holiday
                                  ? `${getHolidayTypeStyle(holiday.type)} font-bold cursor-pointer hover:scale-110 shadow-sm`
                                  : "text-muted-foreground hover:bg-muted/30"
                              }`}
                              title={holiday ? `${holiday.name} (${holiday.type})` : undefined}
                              disabled={!holiday}
                            >
                              {dayNum}
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* MODAL 1: Create Calendar Year */}
      {isCreateCalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Add Yearly Holiday Calendar</h3>
            <form onSubmit={handleCreateCalendar} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Select Calendar Year</label>
                <Input required type="number" placeholder="2026" value={createYear} onChange={(e) => setCreateYear(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateCalOpen(false)}>Cancel</Button>
                <Button type="submit">Create Calendar</Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 2: Add / Edit Holiday Form */}
      {isHolidayFormOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-foreground mb-4">{isEditMode ? "Edit Holiday Info" : "Add New Holiday"}</h3>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddHolidaySubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Holiday Name</label>
                <Input required placeholder="New Year's Day, Diwali, etc." value={holidayName} onChange={(e) => setHolidayName(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Holiday Type</label>
                  <Select value={holidayType} onValueChange={setHolidayType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="national">National</SelectItem>
                      <SelectItem value="festival">Festival</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="regional">Regional</SelectItem>
                      <SelectItem value="optional">Optional</SelectItem>
                      <SelectItem value="special_event">Special Event</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    <CalendarDays className="w-3.5 h-3.5 text-white" />
                    Date
                  </label>
                  <DateField required value={holidayDate} onChange={setHolidayDate} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Applicable Location / State</label>
                <Input required placeholder="All, Karnataka, Delhi, etc." value={holidayLoc} onChange={(e) => setHolidayLoc(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Applicable Departments (Optional)</label>
                <Input placeholder="Engineering, HR, comma separated..." value={holidayDepts} onChange={(e) => setHolidayDepts(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Description</label>
                <Textarea placeholder="Holiday background or remarks..." value={holidayDesc} onChange={(e) => setHolidayDesc(e.target.value)} rows={3} />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} className="rounded bg-muted border-border" />
                  <span>Is Paid Holiday?</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="rounded bg-muted border-border" />
                  <span>Is Recurring every year?</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                <Button type="button" variant="outline" onClick={() => setIsHolidayFormOpen(false)}>Cancel</Button>
                <Button type="submit">Save Holiday</Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 3: CSV/JSON Import */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-xl w-full max-w-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">Import Holiday File</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload a CSV or JSON file up to 5 MB, or paste the file content below.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setIsImportOpen(false)}
                disabled={actionLoading === "import"}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center hover:bg-muted/30 transition-colors">
                <Upload className="w-7 h-7 text-emerald-400 mb-2" />
                <span className="text-sm font-semibold text-foreground">Choose CSV or JSON file</span>
                <span className="text-xs text-muted-foreground mt-1">Supported: .csv, .json · Maximum 5 MB</span>
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="hidden"
                  onChange={handleImportFileChange}
                  disabled={actionLoading === "import"}
                />
              </label>

              {importFileName && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{importFileName}</span>
                    <Badge variant="outline" className="uppercase text-[10px]">{importFormat}</Badge>
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={clearImportFile} disabled={actionLoading === "import"}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              {importError && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground cursor-pointer">
                  <input type="radio" checked={importFormat === "csv"} onChange={() => setImportFormat("csv")} disabled={actionLoading === "import"} />
                  CSV
                </label>
                <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground cursor-pointer">
                  <input type="radio" checked={importFormat === "json"} onChange={() => setImportFormat("json")} disabled={actionLoading === "import"} />
                  JSON
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">File content</label>
                <Textarea
                  required
                  placeholder={
                    importFormat === "csv"
                      ? "HolidayName,HolidayType,Date,Description,Location,Departments,IsPaid,IsRecurring\nIndependence Day,national,2026-08-15,National holiday,All,,Yes,Yes"
                      : '[\n  {\n    "name": "Independence Day",\n    "type": "national",\n    "date": "2026-08-15",\n    "location": "All",\n    "isPaid": true,\n    "isRecurring": true\n  }\n]'
                  }
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportError("");
                  }}
                  rows={11}
                  className="font-mono text-xs"
                  disabled={actionLoading === "import"}
                />
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                CSV headers expected: <code className="text-emerald-400">HolidayName, HolidayType, Date, Description, Location, Departments, IsPaid, IsRecurring</code>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsImportOpen(false)} disabled={actionLoading === "import"}>
                  Cancel
                </Button>
                <Button type="submit" disabled={actionLoading === "import" || !importText.trim()} className="gap-2">
                  {actionLoading === "import" && <Loader2 className="w-4 h-4 animate-spin" />}
                  Import Holidays
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 4: Holiday Detail Popover */}
      {selectedHolidayDetails && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-xl w-full max-w-sm shadow-2xl p-6 relative">
            <button
              onClick={() => setSelectedHolidayDetails(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-sm font-bold bg-muted/30 w-6 h-6 rounded-full flex items-center justify-center"
            >
              ×
            </button>
            <div className="space-y-4">
              <div>
                <Badge variant="outline" className={`capitalize font-mono text-[9px] px-2 py-0.5 rounded-full ${getHolidayTypeStyle(selectedHolidayDetails.type)}`}>
                  {selectedHolidayDetails.type}
                </Badge>
                <h3 className="text-xl font-bold text-foreground mt-1">{selectedHolidayDetails.name}</h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-white shrink-0" />
                  {new Date(selectedHolidayDetails.date).toLocaleDateString("en-IN", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </p>
              </div>

              {selectedHolidayDetails.description && (
                <div className="text-xs bg-muted/20 p-3 rounded-lg border border-border text-foreground/80 leading-relaxed">
                  <div className="flex items-start gap-1 text-[10px] uppercase font-bold text-muted-foreground mb-1">
                    <Info className="w-3.5 h-3.5" /> Description
                  </div>
                  {selectedHolidayDetails.description}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-border pt-3">
                <div>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Location</span>
                  <div className="flex items-center gap-1 font-semibold text-foreground/90 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{selectedHolidayDetails.location}</span>
                  </div>
                </div>

                {selectedHolidayDetails.departments && (
                  <div>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Departments</span>
                    <div className="flex items-center gap-1 font-semibold text-foreground/90 mt-0.5">
                      <Building className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="truncate">{selectedHolidayDetails.departments}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 pt-1">
                <Badge variant={selectedHolidayDetails.isPaid ? "outline" : "secondary"} className={selectedHolidayDetails.isPaid ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground"}>
                  {selectedHolidayDetails.isPaid ? "Paid Holiday" : "Unpaid Holiday"}
                </Badge>
                {selectedHolidayDetails.isRecurring && (
                  <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20">
                    Recurring Annually
                  </Badge>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// Simple Dropdown Menu components implemented inline for lightweight compilation
function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative inline-block text-left" onMouseLeave={() => setIsOpen(false)}>
      {React.Children.map(children, (child) => {
        if (child && (child as any).type === DropdownMenuTrigger) {
          return React.cloneElement(child as any, { onClick: () => setIsOpen(!isOpen) });
        }
        if (child && (child as any).type === DropdownMenuContent) {
          return isOpen ? child : null;
        }
        return child;
      })}
    </div>
  );
}

function DropdownMenuTrigger({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <div onClick={onClick} className="cursor-pointer">{children}</div>;
}

function DropdownMenuContent({ children, className, align }: { children: React.ReactNode; className?: string; align?: string }) {
  return (
    <div className={`absolute z-50 mt-2 w-56 rounded-md shadow-lg bg-card ring-1 ring-black ring-opacity-5 focus:outline-none ${align === "end" ? "right-0" : "left-0"} ${className}`}>
      <div className="py-1">{children}</div>
    </div>
  );
}

function DropdownMenuItem({
  children,
  className,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-2 text-sm text-foreground/90 hover:bg-muted/50 hover:text-foreground transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}
