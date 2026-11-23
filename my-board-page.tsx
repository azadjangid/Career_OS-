'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/auth-store'
import { useBoard } from '@/contexts/board-store'
import { api, ApiError } from '@/services/api-client'
import type { Task, Status } from '@/types'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TaskCard } from '@/components/kanban/task-card'
import { TaskDrawer } from '@/components/kanban/task-drawer'
import { TaskModal } from '@/components/kanban/task-modal'
import { parseBugData } from '@/utils/bug-helper'
import {
  CheckCircle2,
  Circle,
  Clock,
  HelpCircle,
  ListTodo,
  RefreshCw,
  User as UserIcon,
  Search,
  X,
  AlertCircle,
  Building2,
  FolderKanban,
  Globe,
} from 'lucide-react'

interface UserItem {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: number
  roleName?: string
}

interface WorkspaceMemberOption {
  id: string
  name: string
  email: string
  role: string
  userId: string | null
}

interface WorkspaceOption {
  id: string
  clientName: string
  companyName: string
  members: WorkspaceMemberOption[]
}

interface ProjectOption {
  id: string
  name: string
  color: string
  workspaceId: string
}

interface SummaryData {
  todo: number
  in_progress: number
  testing: number
  done: number
  total: number
}

interface PaginationData {
  page: number
  limit: number
  total: number
  totalPages: number
}

const statusColumns: { id: Status; title: string; icon: React.ElementType; colorClass: string }[] = [
  { id: 'todo', title: 'To Do', icon: Circle, colorClass: 'text-amber-500 bg-amber-500/10' },
  { id: 'in-progress', title: 'In Progress', icon: Clock, colorClass: 'text-blue-500 bg-blue-500/10' },
  { id: 'testing', title: 'Review / Testing', icon: HelpCircle, colorClass: 'text-purple-500 bg-purple-500/10' },
  { id: 'done', title: 'Done', icon: CheckCircle2, colorClass: 'text-emerald-500 bg-emerald-500/10' },
]

export default function MyBoardPage() {
  const { user: currentUser } = useAuth()
  const { openDrawer } = useBoard()

  const isAdmin =
    currentUser?.role === 1 ||
    currentUser?.role === 5 ||
    currentUser?.roleName?.toLowerCase() === 'admin' ||
    currentUser?.roleName?.toLowerCase() === 'manager'

  // Admin User Selector state
  const [usersList, setUsersList] = useState<UserItem[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  // Workspace & Project Filter Options
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('all')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')

  // Board Data state
  const [targetUserInfo, setTargetUserInfo] = useState<{ name: string; email: string } | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [summary, setSummary] = useState<SummaryData>({
    todo: 0,
    in_progress: 0,
    testing: 0,
    done: 0,
    total: 0,
  })
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  })

  // Filter State
  const [search, setSearch] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')

  // Loading & Error states
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const activeRequestTokenRef = useRef<number>(0)

  // 1. Fetch Workspaces (with their members) & Projects for filter dropdowns
  useEffect(() => {
    api
      .get<any[]>('/workspaces')
      .then((data) => {
        if (Array.isArray(data)) {
          setWorkspaces(
            data.map((w) => ({
              id: w.id,
              clientName: w.clientName || w.companyName || 'Workspace',
              companyName: w.companyName || w.clientName || 'Company',
              members: Array.isArray(w.members)
                ? w.members.map((m: any) => ({
                    id: m.id,
                    name: m.name ?? '',
                    email: m.email ?? '',
                    role: m.role ?? 'Member',
                    userId: m.userId ?? null,
                  }))
                : [],
            }))
          )
        }
      })
      .catch((err) => console.error('Failed to load workspaces for filter:', err))

    api
      .get<any[]>('/projects')
      .then((data) => {
        if (Array.isArray(data)) {
          setProjects(
            data.map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color || '#3b82f6',
              workspaceId: p.workspaceId,
            }))
          )
        }
      })
      .catch((err) => console.error('Failed to load projects for filter:', err))
  }, [])

  // 2. Fetch user list for Admin
  useEffect(() => {
    if (!isAdmin) return

    let isMounted = true
    setIsLoadingUsers(true)

    api
      .get<UserItem[]>('/users')
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setUsersList(data)
          if (currentUser?.id) {
            setSelectedUserId((prev) => prev || currentUser.id)
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load user list for Admin:', err)
      })
      .finally(() => {
        if (isMounted) setIsLoadingUsers(false)
      })

    return () => {
      isMounted = false
    }
  }, [isAdmin, currentUser?.id])

  // For a specific workspace, find which members actually have tasks assigned in it
  // (null = not applicable / still loading). Uses the existing my-board endpoint per member.
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string> | null>(null)
  const [isLoadingAssigned, setIsLoadingAssigned] = useState(false)

  useEffect(() => {
    if (!isAdmin || selectedWorkspaceId === 'all') {
      setAssignedUserIds(null)
      return
    }

    const workspace = workspaces.find((w) => w.id === selectedWorkspaceId)
    if (!workspace) {
      setAssignedUserIds(null)
      return
    }

    // Resolve each member to a real user id
    const memberUserIds = Array.from(
      new Set(
        workspace.members
          .map(
            (m) =>
              m.userId ??
              usersList.find((u) => m.email && u.email?.toLowerCase() === m.email.toLowerCase())?.id ??
              null
          )
          .filter((id): id is string => !!id)
      )
    )

    let cancelled = false
    setIsLoadingAssigned(true)

    Promise.all(
      memberUserIds.map(async (uid) => {
        try {
          const params = new URLSearchParams({
            page: '1',
            limit: '1',
            workspaceId: selectedWorkspaceId,
          })
          if (uid !== currentUser?.id) params.set('userId', uid)
          const res = await api.get<any>(`/tasks/my-board?${params.toString()}`)
          return (res?.summary?.total ?? 0) > 0 ? uid : null
        } catch {
          return null
        }
      })
    )
      .then((ids) => {
        if (!cancelled) setAssignedUserIds(new Set(ids.filter((id): id is string => !!id)))
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAssigned(false)
      })

    return () => {
      cancelled = true
    }
  }, [isAdmin, selectedWorkspaceId, workspaces, usersList, currentUser?.id])

  // Users shown in the USER dropdown. "All Workspaces" -> everyone;
  // a specific workspace -> only members who have tasks assigned in that workspace.
  const selectableUsers = useMemo<(UserItem & { memberRole?: string })[]>(() => {
    if (selectedWorkspaceId === 'all') {
      // Admin sees everyone. A manager sees only people who share a workspace with them.
      if (currentUser?.role === 1) return usersList
      const sharedUserIds = new Set<string>()
      const sharedEmails = new Set<string>()
      for (const w of workspaces) {
        for (const m of w.members) {
          if (m.userId) sharedUserIds.add(m.userId)
          if (m.email) sharedEmails.add(m.email.toLowerCase())
        }
      }
      return usersList.filter(
        (u) =>
          u.id === currentUser?.id ||
          sharedUserIds.has(u.id) ||
          sharedEmails.has(u.email?.toLowerCase())
      )
    }

    const workspace = workspaces.find((w) => w.id === selectedWorkspaceId)
    if (!workspace) return usersList

    const result: (UserItem & { memberRole?: string })[] = []
    const seen = new Set<string>()

    for (const member of workspace.members) {
      const matched = usersList.find(
        (u) =>
          (member.userId && u.id === member.userId) ||
          (member.email && u.email?.toLowerCase() === member.email.toLowerCase())
      )
      // Only members that map to a real user can have tasks assigned.
      const resolvedId = matched?.id ?? member.userId
      if (!resolvedId || seen.has(resolvedId)) continue
      seen.add(resolvedId)

      result.push({
        id: resolvedId,
        name: matched?.name || member.name,
        email: matched?.email || member.email,
        avatarUrl: matched?.avatarUrl,
        role: matched?.role ?? 3,
        roleName: matched?.roleName,
        memberRole: member.role,
      })
    }

    // Keep only members that have tasks assigned in this workspace (once known)
    return assignedUserIds ? result.filter((u) => assignedUserIds.has(u.id)) : result
  }, [selectedWorkspaceId, workspaces, usersList, assignedUserIds, currentUser?.id, currentUser?.role])

  // When the workspace changes and the chosen user isn't a member of it,
  // fall back to the current user (if a member) or the first member.
  useEffect(() => {
    if (!isAdmin || selectableUsers.length === 0) return
    if (selectableUsers.some((u) => u.id === selectedUserId)) return

    const fallback =
      selectableUsers.find((u) => u.id === currentUser?.id) ?? selectableUsers[0]
    setSelectedUserId(fallback.id)
    setTasks([])
    setPagination({ page: 1, limit: 50, total: 0, totalPages: 1 })
  }, [isAdmin, selectableUsers, selectedUserId, currentUser?.id])

  // 3. Fetch Board data across all workspaces / filtered
  const fetchMyBoard = useCallback(
    async (pageToLoad: number = 1, append: boolean = false) => {
      const requestToken = ++activeRequestTokenRef.current

      if (append) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
        setError(null)
      }

      try {
        const queryParams = new URLSearchParams()
        queryParams.set('page', String(pageToLoad))
        queryParams.set('limit', '50')

        if (isAdmin && selectedUserId && selectedUserId !== currentUser?.id) {
          queryParams.set('userId', selectedUserId)
        }

        if (selectedWorkspaceId && selectedWorkspaceId !== 'all') {
          queryParams.set('workspaceId', selectedWorkspaceId)
        }

        if (selectedProjectId && selectedProjectId !== 'all') {
          queryParams.set('projectId', selectedProjectId)
        }

        const endpoint = `/tasks/my-board?${queryParams.toString()}`
        const res = await api.get<any>(endpoint)

        // Ignore out-of-order responses
        if (requestToken !== activeRequestTokenRef.current) return

        const mappedTasks: Task[] = (res.tasks ?? []).map((t: any) => {
          const isBug = t.taskType === 'BUG'
          const bugData = isBug ? parseBugData(t.description) : null

          return {
            id: t.id,
            title: t.title ?? 'Untitled Task',
            description: isBug ? (bugData?.description ?? t.description ?? '') : (t.description ?? ''),
            rawDescription: t.description ?? '',
            status: (t.status as Status) || 'todo',
            priority: t.priority ?? 'medium',
            taskType: (t.taskType ?? 'FEATURE') as 'FEATURE' | 'BUG',
            severity: bugData?.severity,
            stepsToReproduce: bugData?.stepsToReproduce,
            expectedResult: bugData?.expectedResult,
            actualResult: bugData?.actualResult,
            modulePage: bugData?.modulePage,
            attachment: bugData?.attachment,
            projectId: t.projectId ?? t.project?.id,
            projectName: t.projectName ?? t.project?.name,
            projectColor: t.projectColor ?? t.project?.color,
            workspaceId: t.workspaceId ?? t.project?.workspaceId,
            workspaceName: t.workspaceName ?? t.project?.workspace?.clientName ?? t.project?.workspace?.companyName,
            assignee: t.assignee
              ? {
                  id: t.assignee.id || '',
                  name: t.assignee.name ?? 'Unknown',
                  avatar: t.assignee.avatar ?? t.assignee.avatarUrl ?? '',
                  email: t.assignee.email ?? '',
                  role: t.assignee.role ?? 3,
                  roleName: t.assignee.roleName ?? 'Developer',
                }
              : null,
            labels: t.labels ?? [],
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
            updatedAt: t.updatedAt ? new Date(t.updatedAt) : new Date(),
            comments: (t.comments ?? []).map((c: any) => ({
              id: c.id,
              content: c.content ?? '',
              author: {
                id: c.author?.id || '',
                name: c.author?.name ?? 'Unknown',
                avatar: c.author?.avatar ?? c.author?.avatarUrl ?? '',
                email: c.author?.email ?? '',
                role: c.author?.role ?? 3,
                roleName: c.author?.roleName ?? 'Developer',
              },
              createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
            })),
            activity: (t.activity ?? []).map((a: any) => ({
              id: a.id,
              type: a.type,
              user: {
                id: a.user?.id || '',
                name: a.user?.name ?? 'Unknown',
                avatar: a.user?.avatar ?? a.user?.avatarUrl ?? '',
                email: a.user?.email ?? '',
                role: a.user?.role ?? 3,
                roleName: a.user?.roleName ?? 'Developer',
              },
              timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
              details: a.details ?? {},
            })),
          }
        })

        if (res.user) {
          setTargetUserInfo({ name: res.user.name, email: res.user.email })
        }

        if (res.summary) {
          setSummary(res.summary)
        }

        if (res.pagination) {
          setPagination(res.pagination)
        }

        if (append) {
          setTasks((prev) => [...prev, ...mappedTasks])
        } else {
          setTasks(mappedTasks)
        }
      } catch (err) {
        if (requestToken === activeRequestTokenRef.current) {
          console.error('Failed to load My Board:', err)
          if (!append) {
            const msg =
              err instanceof ApiError && typeof err.body?.message === 'string'
                ? err.body.message
                : 'Unable to load board tasks. Please check your connection and try again.'
            setError(msg)
          }
        }
      } finally {
        if (requestToken === activeRequestTokenRef.current) {
          setIsLoading(false)
          setIsLoadingMore(false)
        }
      }
    },
    [isAdmin, selectedUserId, currentUser?.id, selectedWorkspaceId, selectedProjectId]
  )

  useEffect(() => {
    fetchMyBoard(1, false)
  }, [fetchMyBoard])

  const handleUserChange = (newUserId: string) => {
    setSelectedUserId(newUserId)
    setTasks([])
    setPagination({ page: 1, limit: 50, total: 0, totalPages: 1 })
  }

  const handleLoadMore = () => {
    if (pagination.page < pagination.totalPages && !isLoadingMore) {
      fetchMyBoard(pagination.page + 1, true)
    }
  }

  // Filter available projects based on selected workspace
  const availableProjects = useMemo(() => {
    if (selectedWorkspaceId === 'all') return projects
    return projects.filter((p) => p.workspaceId === selectedWorkspaceId)
  }, [projects, selectedWorkspaceId])

  // Filter tasks by search, type, and priority
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch =
        !search.trim() ||
        task.title.toLowerCase().includes(search.toLowerCase()) ||
        task.description?.toLowerCase().includes(search.toLowerCase()) ||
        task.projectName?.toLowerCase().includes(search.toLowerCase()) ||
        task.workspaceName?.toLowerCase().includes(search.toLowerCase()) ||
        task.modulePage?.toLowerCase().includes(search.toLowerCase())

      const matchesType =
        typeFilter === 'all' || task.taskType === typeFilter

      const matchesPriority =
        priorityFilter === 'all' || task.priority === priorityFilter

      return matchesSearch && matchesType && matchesPriority
    })
  }, [tasks, search, typeFilter, priorityFilter])

  const selectedUserObj =
    selectableUsers.find((u) => u.id === selectedUserId) ??
    usersList.find((u) => u.id === selectedUserId)
  const displayName = isAdmin
    ? selectedUserObj?.name || targetUserInfo?.name || 'Selected User'
    : currentUser?.name || targetUserInfo?.name || 'You'

  const selectedWorkspaceName =
    selectedWorkspaceId === 'all'
      ? 'All Workspaces'
      : workspaces.find((w) => w.id === selectedWorkspaceId)?.clientName || 'Selected Workspace'

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setPriorityFilter('all')
    setSelectedWorkspaceId('all')
    setSelectedProjectId('all')
  }

  return (
    <div className="h-full flex flex-col space-y-6 p-6 overflow-y-auto">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ListTodo className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">My Board</h1>
            <Badge variant="outline" className="text-xs font-semibold gap-1 ml-1 bg-primary/5 text-primary border-primary/20">
              <Globe className="h-3 w-3" />
              {selectedWorkspaceName}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Viewing tasks assigned to{' '}
            <span className="font-semibold text-foreground">{displayName}</span>{' '}
            {selectedWorkspaceId === 'all'
              ? 'across all workspace projects.'
              : `in ${selectedWorkspaceName}.`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchMyBoard(1, false)}
            disabled={isLoading}
            className="h-9 gap-1.5"
            title="Refresh My Board"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Admin User Selector (members of the selected workspace) */}
          {isAdmin && (
            <div className="flex items-center gap-2 bg-card p-1.5 px-3 rounded-lg border border-border shadow-sm">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:inline">
                User:
              </span>
              <Select value={selectedUserId || currentUser?.id || ''} onValueChange={handleUserChange}>
                <SelectTrigger className="w-[180px] sm:w-[220px] h-8 text-xs">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingUsers && usersList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Spinner className="w-4 h-4" /> Loading users...
                    </div>
                  ) : isLoadingAssigned ? (
                    <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Spinner className="w-4 h-4" /> Loading members...
                    </div>
                  ) : selectableUsers.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No member has tasks assigned in this workspace
                    </div>
                  ) : (
                    selectableUsers.map((usr) => (
                      <SelectItem key={usr.id} value={usr.id}>
                        <span className="flex items-center justify-between w-full gap-2">
                          <span className="font-medium truncate">{usr.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {usr.memberRole || usr.roleName || (usr.role === 1 ? 'Admin' : 'Member')}
                          </span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Status Summary Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">To Do</p>
            <p className="text-2xl font-bold text-amber-500 mt-1">{summary.todo}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
            <Circle className="h-5 w-5" />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">In Progress</p>
            <p className="text-2xl font-bold text-blue-500 mt-1">{summary.in_progress}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Review</p>
            <p className="text-2xl font-bold text-purple-500 mt-1">{summary.testing}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-500">
            <HelpCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Done</p>
            <p className="text-2xl font-bold text-emerald-500 mt-1">{summary.done}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Tasks</p>
            <p className="text-2xl font-bold text-foreground mt-1">{summary.total}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <ListTodo className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-wrap items-center gap-2.5 bg-card/60 p-3 rounded-xl border border-border">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tasks by title, project, client, or module..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Workspace Filter (All Workspaces by default) */}
        <div className="w-48">
          <Select
            value={selectedWorkspaceId}
            onValueChange={(val) => {
              setSelectedWorkspaceId(val)
              setSelectedProjectId('all')
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Workspace: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Workspace: All Workspaces</SelectItem>
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  {ws.clientName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Project Filter */}
        <div className="w-44">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Project: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Project: All Projects</SelectItem>
              {availableProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Type Filter */}
        <div className="w-32">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Type: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Type: All</SelectItem>
              <SelectItem value="FEATURE">Features</SelectItem>
              <SelectItem value="BUG">Bugs</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Priority Filter */}
        <div className="w-32">
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Priority: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Priority: All</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(search ||
          typeFilter !== 'all' ||
          priorityFilter !== 'all' ||
          selectedWorkspaceId !== 'all' ||
          selectedProjectId !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-8 gap-1 text-xs text-muted-foreground"
          >
            <X className="h-3 w-3" /> Reset
          </Button>
        )}

        <div className="ml-auto text-xs text-muted-foreground font-medium hidden sm:block">
          Showing {filteredTasks.length} of {tasks.length} tasks
        </div>
      </div>

      {/* Main Board Content */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[320px] text-center p-8 bg-card rounded-xl border border-border">
          <Spinner className="w-8 h-8 text-primary mb-3" />
          <p className="text-sm font-medium text-foreground">Loading assigned tasks across workspaces...</p>
          <p className="text-xs text-muted-foreground mt-1">Retrieving cards for {displayName}.</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] text-center p-8 bg-card rounded-xl border border-destructive/20 max-w-lg mx-auto">
          <div className="p-3 rounded-full bg-destructive/10 text-destructive mb-3">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">Failed to load My Board</h3>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchMyBoard(1, false)} className="gap-2 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[320px] text-center p-8 bg-card rounded-xl border border-dashed border-border shadow-sm">
          <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500 mb-4">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {isAdmin && selectedUserId !== currentUser?.id
              ? 'No tasks assigned'
              : "You're all caught up!"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {isAdmin && selectedUserId !== currentUser?.id
              ? selectedWorkspaceId === 'all'
                ? 'This user currently has no assigned tasks across any workspace.'
                : `This member has no assigned tasks in ${selectedWorkspaceName}.`
              : selectedWorkspaceId === 'all'
                ? 'There are no active tasks assigned to you across any workspace right now.'
                : `There are no active tasks assigned to you in ${selectedWorkspaceName} right now.`}
          </p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[250px] text-center p-8 bg-card rounded-xl border border-dashed border-border">
          <Search className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
          <h3 className="text-base font-medium text-foreground">No matching tasks</h3>
          <p className="text-xs text-muted-foreground mt-1">
            No tasks matched your search &apos;{search}&apos; or active filters.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={resetFilters}
            className="mt-3 gap-1 text-xs"
          >
            Reset Filters
          </Button>
        </div>
      ) : (
        <div className="flex-1 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statusColumns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id)
              const ColumnIcon = col.icon

              return (
                <div
                  key={col.id}
                  className="flex flex-col bg-card/60 rounded-xl border border-border p-4 shadow-sm min-h-[400px]"
                >
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md ${col.colorClass}`}>
                        <ColumnIcon className="h-4 w-4" />
                      </div>
                      <h2 className="font-semibold text-sm text-foreground">{col.title}</h2>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-1">
                    {colTasks.length === 0 ? (
                      <div className="h-32 flex items-center justify-center text-center p-3 text-xs text-muted-foreground/60 border border-dashed border-border/60 rounded-lg">
                        No tasks in {col.title}
                      </div>
                    ) : (
                      colTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onClick={() => openDrawer(task)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Load More Pagination */}
          {pagination.page < pagination.totalPages && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="gap-2"
              >
                {isLoadingMore ? (
                  <>
                    <Spinner className="w-4 h-4" /> Loading more...
                  </>
                ) : (
                  <>
                    Load More Tasks ({pagination.total - tasks.length} remaining)
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Task Drawer & Modal for task details */}
      <TaskDrawer />
      <TaskModal />
    </div>
  )
}
