'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Calendar as CalendarIcon,
  Flag,
  Briefcase,
  Tag,
  Bug,
  Sparkles,
  Paperclip,
  FileText,
  AlertCircle,
  Layers,
  CheckCircle2,
  ShieldAlert,
  User,
  Palette,
  Link2,
} from 'lucide-react'
import { format } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useBoard } from '@/contexts/board-store'
import { useProjects } from '@/contexts/project-store'
import { useWorkspace } from '@/contexts/workspace-context'
import type { Priority, Status } from '@/types'
import { cn } from '@/utils/utils'
import {
  severityConfig,
  type Severity,
  type BugAttachment,
  serializeBugData,
  validateBugAttachment,
  fileToDataUrl,
} from '@/utils/bug-helper'

type TaskType = 'FEATURE' | 'BUG' | 'DESIGN'

const priorityConfig: Record<
  Priority,
  {
    label: string
    color: string
    bgColor: string
  }
> = {
  urgent: {
    label: 'Urgent',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
  },
  high: {
    label: 'High',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
  },
  low: {
    label: 'Low',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
}

const typeConfig: Record<
  TaskType,
  {
    label: string
    color: string
    bgColor: string
    icon: React.ElementType
  }
> = {
  FEATURE: {
    label: 'Feature',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    icon: Sparkles,
  },
  BUG: {
    label: 'Bug',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    icon: Bug,
  },
  DESIGN: {
    label: 'Design',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/20',
    icon: Palette,
  },
}

const statusConfig: Record<
  Status,
  {
    label: string
    color: string
  }
> = {
  todo: {
    label: 'To Do',
    color: 'bg-status-todo',
  },
  'in-progress': {
    label: 'In Progress',
    color: 'bg-status-progress',
  },
  testing: {
    label: 'Testing',
    color: 'bg-status-testing',
  },
  done: {
    label: 'Done',
    color: 'bg-status-done',
  },
}

const DESIGN_CATEGORIES = [
  'UI/UX Design',
  'Website Design',
  'Landing Page',
  'Graphic Design',
  'Banner',
  'Logo',
  'Prototype',
  'Wireframe',
  'Responsive Design',
] as const

type DesignCategory = (typeof DESIGN_CATEGORIES)[number]

/*
 * Design-specific data is stored in the task description as JSON
 * (same approach as serializeBugData for bugs).
 */
function serializeDesignData(data: {
  category: DesignCategory
  brief: string
  referenceUrl: string
}) {
  return JSON.stringify({ type: 'DESIGN', ...data })
}

const labelClass =
  'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export function TaskModal() {
  const {
    isCreateModalOpen,
    createModalDefaultStatus,
    currentProjectId,
    currentUser,
    closeCreateModal,
    createTask,
  } = useBoard()

  const { projects } = useProjects()
  const { workspaces } = useWorkspace()

  // General fields
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState<Status>('todo')
  const [priority, setPriority] = useState<Priority>('medium')
  const [taskType, setTaskType] = useState<TaskType>('FEATURE')
  const [dueAt, setDueAt] = useState('')
  const [assigneeId, setAssigneeId] = useState('')

  // Feature specific
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')

  // Bug specific
  const [bugTitle, setBugTitle] = useState('')
  const [bugDescription, setBugDescription] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [expectedResult, setExpectedResult] = useState('')
  const [actualResult, setActualResult] = useState('')
  const [severity, setSeverity] = useState<Severity>('moderate')
  const [modulePage, setModulePage] = useState('')
  const [attachment, setAttachment] = useState<BugAttachment | null>(null)
  const [attachmentInputKey, setAttachmentInputKey] = useState(0)

  // Design specific
  const [designTitle, setDesignTitle] = useState('')
  const [designCategory, setDesignCategory] =
    useState<DesignCategory>('UI/UX Design')
  const [designBrief, setDesignBrief] = useState('')
  const [designReferenceUrl, setDesignReferenceUrl] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isCreateModalOpen) {
      setTitle('')
      setDescription('')
      setNote('')
      setBugTitle('')
      setBugDescription('')
      setStepsToReproduce('')
      setExpectedResult('')
      setActualResult('')
      setSeverity('moderate')
      setModulePage('')
      setAttachment(null)
      setAttachmentInputKey((k) => k + 1)
      setDesignTitle('')
      setDesignCategory('UI/UX Design')
      setDesignBrief('')
      setDesignReferenceUrl('')
      setPriority('medium')
      setTaskType('FEATURE')
      setDueAt('')
      setAssigneeId('')

      setProjectId(
        currentProjectId || (projects.length > 0 ? projects[0].id : '')
      )

      setStatus(createModalDefaultStatus || 'todo')
      setErrors({})
      setIsSubmitting(false)
    }
  }, [
    isCreateModalOpen,
    currentProjectId,
    createModalDefaultStatus,
    projects,
  ])

  if (!isCreateModalOpen) {
    return null
  }

  const isDesign = taskType === 'DESIGN'

  const selectedProject = projects.find((project) => project.id === projectId)
  const canAssignTasks =
    currentUser.role === 1 ||
    currentUser.role === 5 ||
    ['admin', 'manager'].includes(currentUser.roleName.toLowerCase())
  const workspaceMembers = workspaces.find(
    (workspace) => workspace.id === selectedProject?.workspaceId
  )?.members ?? []
  const assignableMembers = workspaceMembers.filter((member) => member.userId)

  const getToday = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }

  const isPastDate = (date: Date) => {
    const selectedDate = new Date(date)
    selectedDate.setHours(0, 0, 0, 0)

    return selectedDate < getToday()
  }

  const getDateFromString = (dateString: string) => {
    return new Date(`${dateString}T00:00:00`)
  }

  const formatDateForState = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  const clearError = (field: string) => {
    setErrors((prev) => {
      const updated = { ...prev }
      delete updated[field]
      return updated
    })
  }

  const handleAttachmentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0] ?? null

    if (!file) return

    const validationError = validateBugAttachment(file)

    if (validationError) {
      setErrors((prev) => ({
        ...prev,
        attachment: validationError,
      }))

      e.target.value = ''
      return
    }

    clearError('attachment')

    try {
      const dataUrl = await fileToDataUrl(file)

      setAttachment({
        name: file.name,
        url: dataUrl,
        size: file.size,
        type: file.type,
      })
    } catch (err) {
      console.error('Failed to read file:', err)

      setErrors((prev) => ({
        ...prev,
        attachment: 'Failed to process file',
      }))
    }
  }

  const removeAttachment = () => {
    setAttachment(null)
    setAttachmentInputKey((k) => k + 1)
    clearError('attachment')
  }

  /*
   * Central validation function.
   *
   * This is used by:
   * 1. onBlur validation
   * 2. Submit validation
   *
   * BUG fields:
   * - Bug Title              REQUIRED
   * - Steps to Reproduce     REQUIRED
   * - Expected Result        REQUIRED
   * - Actual Result          REQUIRED
   *
   * DESIGN fields:
   * - Assign Designer        REQUIRED
   * - Design Category        REQUIRED
   * - Design Task Title      REQUIRED
   * - Reference URL          OPTIONAL (must be a valid http(s) URL)
   *
   * Optional:
   * - Description
   * - Attachment
   * - Due Date
   */
  const getFieldError = (field: string): string | undefined => {
    switch (field) {
      case 'projectId':
        return !projectId ? 'Project is required' : undefined

      case 'status':
        return !status ? 'Status is required' : undefined

      case 'taskType':
        return !taskType ? 'Task type is required' : undefined

      case 'title':
        return taskType === 'FEATURE' && !title.trim()
          ? 'Title is required'
          : undefined

      case 'bugTitle':
        return taskType === 'BUG' && !bugTitle.trim()
          ? 'Bug Title is required'
          : undefined

      case 'stepsToReproduce':
        return taskType === 'BUG' && !stepsToReproduce.trim()
          ? 'Steps to Reproduce are required'
          : undefined

      case 'expectedResult':
        return taskType === 'BUG' && !expectedResult.trim()
          ? 'Expected Result is required'
          : undefined

      case 'actualResult':
        return taskType === 'BUG' && !actualResult.trim()
          ? 'Actual Result is required'
          : undefined

      case 'designTitle':
        return taskType === 'DESIGN' && !designTitle.trim()
          ? 'Design Task Title is required'
          : undefined

      case 'designCategory':
        return taskType === 'DESIGN' && !designCategory
          ? 'Design Category is required'
          : undefined

      case 'assigneeId':
        return taskType === 'DESIGN' && !assigneeId
          ? 'Please assign a designer'
          : undefined

      case 'designReferenceUrl': {
        const url = designReferenceUrl.trim()

        if (taskType !== 'DESIGN' || !url) {
          return undefined
        }

        try {
          const parsed = new URL(url)

          return ['http:', 'https:'].includes(parsed.protocol)
            ? undefined
            : 'Please enter a valid URL'
        } catch {
          return 'Please enter a valid URL'
        }
      }

      case 'dueAt': {
        if (!dueAt) {
          return undefined
        }

        const selectedDate = getDateFromString(dueAt)

        if (Number.isNaN(selectedDate.getTime())) {
          return 'Please select a valid due date'
        }

        if (isPastDate(selectedDate)) {
          return 'Due date cannot be before today'
        }

        return undefined
      }

      default:
        return undefined
    }
  }

  /*
   * Validate one field when user leaves it.
   */
  const handleFieldBlur = (field: string) => {
    const message = getFieldError(field)

    setErrors((prev) => {
      const updated = { ...prev }

      if (message) {
        updated[field] = message
      } else {
        delete updated[field]
      }

      return updated
    })
  }

  /*
   * Validate the entire form before submitting.
   */
  const validate = () => {
    const fieldsByType: Record<TaskType, string[]> = {
      BUG: [
        'projectId',
        'status',
        'taskType',
        'bugTitle',
        'stepsToReproduce',
        'expectedResult',
        'actualResult',
        'dueAt',
      ],
      DESIGN: [
        'projectId',
        'assigneeId',
        'designCategory',
        'status',
        'taskType',
        'designTitle',
        'designReferenceUrl',
        'dueAt',
      ],
      FEATURE: ['projectId', 'status', 'taskType', 'title', 'dueAt'],
    }

    const newErrors: Record<string, string> = {}

    for (const field of fieldsByType[taskType]) {
      const message = getFieldError(field)

      if (message) {
        newErrors[field] = message
      }
    }

    setErrors(newErrors)

    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    if (!validate()) {
      return
    }

    setIsSubmitting(true)

    try {
      if (taskType === 'FEATURE') {
        await createTask({
          projectId,
          status,
          title: title.trim(),
          description: description.trim() || undefined,
          note: note.trim() || undefined,
          dueAt: dueAt || undefined,
          priority,
          taskType: 'FEATURE',
          assigneeId: assigneeId || undefined,
        })
      } else if (taskType === 'BUG') {
        const bugData = {
          description: bugDescription.trim(),
          stepsToReproduce: stepsToReproduce.trim(),
          expectedResult: expectedResult.trim(),
          actualResult: actualResult.trim(),
          severity,
          modulePage,
          attachment,
        }

        await createTask({
          projectId,
          status,
          title: bugTitle.trim(),
          description: serializeBugData(bugData),
          note: note.trim() || undefined,
          dueAt: dueAt || undefined,
          priority,
          taskType: 'BUG',
          assigneeId: assigneeId || undefined,
        })
      } else {
        await createTask({
          projectId,
          status,
          title: designTitle.trim(),
          description: serializeDesignData({
            category: designCategory,
            brief: designBrief.trim(),
            referenceUrl: designReferenceUrl.trim(),
          }),
          note: note.trim() || undefined,
          dueAt: dueAt || undefined,
          priority,
          taskType: 'DESIGN',
          assigneeId,
        })
      }

      closeCreateModal()
    } catch (error) {
      console.error('Failed to create task:', error)

      setErrors((previousErrors) => ({
        ...previousErrors,
        submit: 'Unable to create the task. Please try again.',
      }))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setDueAt('')
      clearError('dueAt')
      return
    }

    if (isPastDate(date)) {
      setErrors((previousErrors) => ({
        ...previousErrors,
        dueAt: 'Due date cannot be before today',
      }))

      return
    }

    setDueAt(formatDateForState(date))
    clearError('dueAt')
  }

  /* ------------------------------------------------------------------ */
  /* Shared field blocks                                                 */
  /* ------------------------------------------------------------------ */

  const projectField = (
    <div className="space-y-1.5">
      <label className={labelClass}>
        <Briefcase className="size-3.5" />
        Project
        <span className="text-destructive">*</span>
      </label>

      <Select
        value={projectId}
        onValueChange={(value) => {
          setProjectId(value)
          setAssigneeId('')
          clearError('projectId')
        }}
        onOpenChange={(open) => {
          if (!open) {
            handleFieldBlur('projectId')
          }
        }}
        disabled={isSubmitting}
      >
        <SelectTrigger
          onBlur={() => handleFieldBlur('projectId')}
          className={cn(
            'h-10 w-full bg-background',
            errors.projectId && 'border-destructive'
          )}
        >
          <SelectValue placeholder="Select a project" />
        </SelectTrigger>

        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {errors.projectId && (
        <p className="text-xs text-destructive">{errors.projectId}</p>
      )}
    </div>
  )

  const statusField = (
    <div className="space-y-1.5">
      <label className={labelClass}>
        Status
        <span className="text-destructive">*</span>
      </label>

      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value as Status)
          clearError('status')
        }}
        onOpenChange={(open) => {
          if (!open) {
            handleFieldBlur('status')
          }
        }}
        disabled={isSubmitting}
      >
        <SelectTrigger
          onBlur={() => handleFieldBlur('status')}
          className={cn(
            'h-10 w-full bg-background',
            errors.status && 'border-destructive'
          )}
        >
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {Object.entries(statusConfig).map(([value, config]) => (
            <SelectItem key={value} value={value}>
              <div className="flex items-center gap-2">
                <div className={cn('size-2 rounded-full', config.color)} />

                <span>{config.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {errors.status && (
        <p className="text-xs text-destructive">{errors.status}</p>
      )}
    </div>
  )

  const priorityField = (
    <div className="space-y-1.5">
      <label className={labelClass}>
        <Flag className="size-3.5" />
        Priority
      </label>

      <Select
        value={priority}
        onValueChange={(value) => setPriority(value as Priority)}
        disabled={isSubmitting}
      >
        <SelectTrigger className="h-10 w-full bg-background">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {Object.entries(priorityConfig).map(([value, config]) => (
            <SelectItem key={value} value={value}>
              <div className="flex items-center gap-2">
                <div className={cn('size-2 rounded-full', config.bgColor)} />

                <span className={config.color}>{config.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const dueDateField = (
    <div className="space-y-1.5">
      <label className={labelClass}>
        <CalendarIcon className="size-3.5 text-primary" />
        Due Date{isDesign ? '' : ' (Optional)'}
      </label>

      <Popover
        onOpenChange={(open) => {
          if (!open) {
            handleFieldBlur('dueAt')
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            className={cn(
              'h-10 w-full justify-start text-left font-normal',
              !dueAt && 'text-muted-foreground',
              errors.dueAt && 'border-destructive'
            )}
          >
            <CalendarIcon className="mr-2 size-4 text-primary" />

            {dueAt ? (
              format(getDateFromString(dueAt), 'PPP')
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dueAt ? getDateFromString(dueAt) : undefined}
            onSelect={handleDateSelect}
            disabled={(date) => isPastDate(date)}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {errors.dueAt && (
        <p className="text-xs text-destructive">{errors.dueAt}</p>
      )}
    </div>
  )

  const noteField = (
    <div className="space-y-1.5">
      <label className={labelClass}>Add Note</label>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={
          isDesign
            ? 'Additional instructions...'
            : 'Add note for this task...'
        }
        disabled={isSubmitting}
        className="resize-none bg-background text-xs"
        rows={isDesign ? 2 : 3}
      />
    </div>
  )

  const submitTheme =
    taskType === 'BUG'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : taskType === 'DESIGN'
        ? 'bg-violet-600 text-white hover:bg-violet-700'
        : ''

  const SubmitIcon = typeConfig[taskType].icon

  const submitLabel = {
    FEATURE: isSubmitting ? 'Creating Task...' : 'Create Task',
    BUG: isSubmitting ? 'Submitting Bug...' : 'Submit Bug',
    DESIGN: isSubmitting ? 'Creating Design Task...' : 'Create Design Task',
  }[taskType]

  const headerTheme = {
    FEATURE: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
    BUG: 'border-red-500/30 bg-red-500/10 text-red-400',
    DESIGN: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  }[taskType]

  const headerTitle = {
    FEATURE: 'Create New Task',
    BUG: 'Report a Bug',
    DESIGN: 'Create Design Task',
  }[taskType]

  const headerSubtitle = {
    FEATURE: 'Add a new feature task to your project board',
    BUG: 'Submit a detailed bug report for Development & QA teams',
    DESIGN: 'Assign a design task to your designer',
  }[taskType]

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeCreateModal}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{
            opacity: 0,
            scale: 0.95,
            y: 20,
          }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: 20,
          }}
          className={cn(
            'relative z-50 flex max-h-[92vh] w-full max-w-2xl flex-col',
            'overflow-y-auto rounded-2xl border border-border',
            'bg-background shadow-2xl'
          )}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-6 py-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-9 items-center justify-center rounded-xl border',
                  headerTheme
                )}
              >
                <SubmitIcon className="size-5" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {headerTitle}
                </h2>

                <p className="text-xs text-muted-foreground">
                  {headerSubtitle}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={closeCreateModal}
              disabled={isSubmitting}
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label="Close task form"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col space-y-5 p-6"
          >
            {/* Submit Error */}
            {errors.submit && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errors.submit}</span>
              </div>
            )}

            {/* Task Type Switcher */}
            <div className="space-y-1.5">
              <label className={labelClass}>
                <Tag className="size-3.5" />
                Task Type
                <span className="text-destructive">*</span>
              </label>

              <div className="grid grid-cols-3 gap-3">
                {(['FEATURE', 'BUG', 'DESIGN'] as const).map((type) => {
                  const isSelected = taskType === type
                  const config = typeConfig[type]
                  const Icon = config.icon

                  const selectedTheme = {
                    FEATURE:
                      'border-blue-500/50 bg-blue-500/10 text-blue-400 ring-2 ring-blue-500/20',
                    BUG: 'border-red-500/50 bg-red-500/10 text-red-400 ring-2 ring-red-500/20',
                    DESIGN:
                      'border-violet-500/50 bg-violet-500/10 text-violet-400 ring-2 ring-violet-500/20',
                  }[type]

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setTaskType(type)

                        /*
                         * Assignee is optional for Feature/Bug but required
                         * for Design, so errors are reset on every switch.
                         */
                        setErrors((prev) => {
                          const updated = { ...prev }

                          delete updated.taskType
                          delete updated.title
                          delete updated.bugTitle
                          delete updated.stepsToReproduce
                          delete updated.expectedResult
                          delete updated.actualResult
                          delete updated.designTitle
                          delete updated.designCategory
                          delete updated.designReferenceUrl
                          delete updated.assigneeId

                          return updated
                        })
                      }}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all',
                        isSelected
                          ? selectedTheme
                          : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                    >
                      <Icon className="size-4" />
                      <span>{config.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* DESIGN FORM */}
            {isDesign ? (
              <div className="space-y-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                {/* Section Header */}
                <div className="flex items-center gap-2 border-b border-violet-500/10 pb-2 text-xs font-bold uppercase tracking-wider text-violet-400">
                  <Palette className="size-4" />
                  Design Task Form
                </div>

                {/* Project */}
                {projectField}

                {/* Assign Designer */}
                <div className="space-y-1.5">
                  <label className={labelClass}>
                    <User className="size-3.5" />
                    Assign Designer
                    <span className="text-destructive">*</span>
                  </label>

                  <Select
                    value={assigneeId}
                    onValueChange={(value) => {
                      setAssigneeId(value)
                      clearError('assigneeId')
                    }}
                    onOpenChange={(open) => {
                      if (!open) {
                        handleFieldBlur('assigneeId')
                      }
                    }}
                    disabled={isSubmitting || assignableMembers.length === 0}
                  >
                    <SelectTrigger
                      onBlur={() => handleFieldBlur('assigneeId')}
                      className={cn(
                        'h-10 w-full bg-background',
                        errors.assigneeId && 'border-destructive'
                      )}
                    >
                      <SelectValue
                        placeholder={
                          assignableMembers.length > 0
                            ? 'Select a designer'
                            : 'No workspace members available'
                        }
                      />
                    </SelectTrigger>

                    <SelectContent>
                      {assignableMembers.map((member) => (
                        <SelectItem key={member.userId} value={member.userId!}>
                          {member.name} ({member.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {errors.assigneeId && (
                    <p className="text-xs text-destructive">
                      {errors.assigneeId}
                    </p>
                  )}
                </div>

                {/* Design Category */}
                <div className="space-y-1.5">
                  <label className={labelClass}>
                    <Layers className="size-3.5" />
                    Design Category
                    <span className="text-destructive">*</span>
                  </label>

                  <Select
                    value={designCategory}
                    onValueChange={(value) => {
                      setDesignCategory(value as DesignCategory)
                      clearError('designCategory')
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger
                      className={cn(
                        'h-10 w-full bg-background',
                        errors.designCategory && 'border-destructive'
                      )}
                    >
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>

                    <SelectContent>
                      {DESIGN_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <p className="text-[11px] text-muted-foreground">
                    {DESIGN_CATEGORIES.join(', ')}
                  </p>

                  {errors.designCategory && (
                    <p className="text-xs text-destructive">
                      {errors.designCategory}
                    </p>
                  )}
                </div>

                {/* Status */}
                {statusField}

                {/* Design Task Title */}
                <div className="space-y-1.5">
                  <label className={labelClass}>
                    Design Task Title
                    <span className="text-destructive">*</span>
                  </label>

                  <Input
                    value={designTitle}
                    onChange={(event) => {
                      setDesignTitle(event.target.value)

                      if (event.target.value.trim()) {
                        clearError('designTitle')
                      }
                    }}
                    onBlur={() => handleFieldBlur('designTitle')}
                    placeholder="e.g. Design the homepage in Figma"
                    disabled={isSubmitting}
                    className={cn(
                      'h-10 bg-background',
                      errors.designTitle && 'border-destructive'
                    )}
                  />

                  {errors.designTitle && (
                    <p className="text-xs text-destructive">
                      {errors.designTitle}
                    </p>
                  )}
                </div>

                {/* Design Brief / Requirements */}
                <div className="space-y-1.5">
                  <label className={labelClass}>
                    Design Brief / Requirements
                  </label>

                  <Textarea
                    value={designBrief}
                    onChange={(e) => setDesignBrief(e.target.value)}
                    placeholder="Describe the design requirements..."
                    disabled={isSubmitting}
                    className="resize-none bg-background text-xs"
                    rows={3}
                  />
                </div>

                {/* Figma / Design Reference URL */}
                <div className="space-y-1.5">
                  <label className={labelClass}>
                    <Link2 className="size-3.5" />
                    Figma / Design Reference URL
                  </label>

                  <Input
                    type="url"
                    value={designReferenceUrl}
                    onChange={(event) => {
                      setDesignReferenceUrl(event.target.value)
                      clearError('designReferenceUrl')
                    }}
                    onBlur={() => handleFieldBlur('designReferenceUrl')}
                    placeholder="Paste Figma, Adobe XD, or reference link"
                    disabled={isSubmitting}
                    className={cn(
                      'h-10 bg-background',
                      errors.designReferenceUrl && 'border-destructive'
                    )}
                  />

                  {errors.designReferenceUrl && (
                    <p className="text-xs text-destructive">
                      {errors.designReferenceUrl}
                    </p>
                  )}
                </div>

                {/* Add Note */}
                {noteField}

                {/* Priority & Due Date */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {priorityField}
                  {dueDateField}
                </div>
              </div>
            ) : (
              <>
                {/* Project, Assignee & Status Row */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {projectField}

                  {canAssignTasks && (
                    <div className="space-y-1.5">
                      <label className={labelClass}>
                        <User className="size-3.5" />
                        Assign To
                      </label>
                      <Select
                        value={assigneeId}
                        onValueChange={setAssigneeId}
                        disabled={
                          isSubmitting || assignableMembers.length === 0
                        }
                      >
                        <SelectTrigger className="h-10 w-full bg-background">
                          <SelectValue
                            placeholder={
                              assignableMembers.length > 0
                                ? 'Unassigned'
                                : 'No workspace members available'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableMembers.map((member) => (
                            <SelectItem
                              key={member.userId}
                              value={member.userId!}
                            >
                              {member.name} ({member.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {statusField}
                </div>

                {/* BUG FORM */}
                {taskType === 'BUG' ? (
                  <div className="space-y-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    {/* Section Header */}
                    <div className="flex items-center gap-2 border-b border-red-500/10 pb-2 text-xs font-bold uppercase tracking-wider text-red-400">
                      <ShieldAlert className="size-4" />
                      Bug Information
                    </div>

                    {/* Bug Title */}
                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>
                          Bug Title
                          <span className="text-destructive"> *</span>
                        </span>

                        <span className="text-[10px] lowercase text-muted-foreground/60">
                          concise summary
                        </span>
                      </label>

                      <Input
                        value={bugTitle}
                        onChange={(event) => {
                          setBugTitle(event.target.value)

                          if (event.target.value.trim()) {
                            clearError('bugTitle')
                          }
                        }}
                        onBlur={() => handleFieldBlur('bugTitle')}
                        placeholder="e.g. Leave calendar fails to render on mobile Safari"
                        disabled={isSubmitting}
                        className={cn(
                          'h-10 bg-background',
                          errors.bugTitle && 'border-destructive'
                        )}
                      />

                      {errors.bugTitle && (
                        <p className="text-xs text-destructive">
                          {errors.bugTitle}
                        </p>
                      )}
                    </div>

                    {/* Severity, Priority & Module */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {/* Severity */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Severity
                          <span className="text-destructive"> *</span>
                        </label>

                        <Select
                          value={severity}
                          onValueChange={(val) =>
                            setSeverity(val as Severity)
                          }
                          disabled={isSubmitting}
                        >
                          <SelectTrigger className="h-10 bg-background">
                            <SelectValue />
                          </SelectTrigger>

                          <SelectContent>
                            {Object.entries(severityConfig).map(
                              ([val, conf]) => (
                                <SelectItem key={val} value={val}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        'size-2 rounded-full',
                                        conf.bgColor
                                      )}
                                    />

                                    <span className={conf.color}>
                                      {conf.label}
                                    </span>
                                  </div>
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Priority */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <Flag className="size-3" />
                          Priority
                          <span className="text-destructive"> *</span>
                        </label>

                        <Select
                          value={priority}
                          onValueChange={(val) =>
                            setPriority(val as Priority)
                          }
                          disabled={isSubmitting}
                        >
                          <SelectTrigger className="h-10 bg-background">
                            <SelectValue />
                          </SelectTrigger>

                          <SelectContent>
                            {Object.entries(priorityConfig).map(
                              ([val, conf]) => (
                                <SelectItem key={val} value={val}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        'size-2 rounded-full',
                                        conf.bgColor
                                      )}
                                    />

                                    <span className={conf.color}>
                                      {conf.label}
                                    </span>
                                  </div>
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Module / Page */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <Layers className="size-3" />
                          Module / Page
                          <span className="text-destructive"> *</span>
                        </label>

                        <Select
                          value={modulePage}
                          onValueChange={(val) => setModulePage(val)}
                          disabled={isSubmitting}
                        >
                          <SelectTrigger className="h-10 bg-background">
                            <SelectValue placeholder="Select Module" />
                          </SelectTrigger>

                          <SelectContent>
                            {MODULE_OPTIONS.map((mod) => (
                              <SelectItem key={mod} value={mod}>
                                {mod}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                      <label className={labelClass}>Description</label>

                      <Textarea
                        value={bugDescription}
                        onChange={(e) => setBugDescription(e.target.value)}
                        placeholder="Provide a detailed explanation of the bug and any relevant background context..."
                        disabled={isSubmitting}
                        className="resize-none bg-background text-xs"
                        rows={3}
                      />
                    </div>

                    {/* Add Note */}
                    {noteField}

                    {/* Steps to Reproduce */}
                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>
                          Steps to Reproduce
                          <span className="text-destructive"> *</span>
                        </span>

                        <span className="text-[10px] text-muted-foreground/70">
                          Step-by-step instructions
                        </span>
                      </label>

                      <Textarea
                        value={stepsToReproduce}
                        onChange={(e) => {
                          setStepsToReproduce(e.target.value)

                          if (e.target.value.trim()) {
                            clearError('stepsToReproduce')
                          }
                        }}
                        onBlur={() => handleFieldBlur('stepsToReproduce')}
                        placeholder={
                          '1. Go to...\n2. Click on...\n3. Observe error...'
                        }
                        disabled={isSubmitting}
                        className={cn(
                          'resize-none bg-background font-mono text-xs',
                          errors.stepsToReproduce && 'border-destructive'
                        )}
                        rows={3}
                      />

                      {errors.stepsToReproduce && (
                        <p className="text-xs text-destructive">
                          {errors.stepsToReproduce}
                        </p>
                      )}
                    </div>

                    {/* Expected vs Actual Result */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* EXPECTED RESULT */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-500 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" />
                          Expected Result
                          <span className="text-destructive"> *</span>
                        </label>

                        <Textarea
                          value={expectedResult}
                          onChange={(e) => {
                            setExpectedResult(e.target.value)

                            if (e.target.value.trim()) {
                              clearError('expectedResult')
                            }
                          }}
                          onBlur={() => handleFieldBlur('expectedResult')}
                          placeholder="What should have happened according to requirements?"
                          disabled={isSubmitting}
                          className={cn(
                            'resize-none bg-background text-xs',
                            errors.expectedResult && 'border-destructive'
                          )}
                          rows={2}
                        />

                        {errors.expectedResult && (
                          <p className="text-xs text-destructive">
                            {errors.expectedResult}
                          </p>
                        )}
                      </div>

                      {/* ACTUAL RESULT */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-400">
                          <AlertCircle className="size-3.5" />
                          Actual Result
                          <span className="text-destructive"> *</span>
                        </label>

                        <Textarea
                          value={actualResult}
                          onChange={(e) => {
                            setActualResult(e.target.value)

                            if (e.target.value.trim()) {
                              clearError('actualResult')
                            }
                          }}
                          onBlur={() => handleFieldBlur('actualResult')}
                          placeholder="What actually occurred instead (error code, crash, UI glitch)?"
                          disabled={isSubmitting}
                          className={cn(
                            'resize-none bg-background text-xs',
                            errors.actualResult && 'border-destructive'
                          )}
                          rows={2}
                        />

                        {errors.actualResult && (
                          <p className="text-xs text-destructive">
                            {errors.actualResult}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Screenshot / Attachment */}
                    <div className="space-y-1.5 pt-1">
                      <label className={labelClass}>
                        <Paperclip className="size-3.5 text-primary" />
                        Screenshot / Attachment (Optional)
                      </label>

                      <Input
                        key={attachmentInputKey}
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.txt"
                        onChange={handleAttachmentUpload}
                        disabled={isSubmitting}
                        className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                      />

                      <p className="text-[11px] text-muted-foreground">
                        Allowed: PNG, JPG, JPEG, WEBP, GIF, PDF, DOC, DOCX,
                        TXT. Maximum: 5 MB.
                      </p>

                      {errors.attachment && (
                        <p className="text-xs text-destructive">
                          {errors.attachment}
                        </p>
                      )}

                      {attachment && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-2.5 shadow-sm">
                          <div className="flex min-w-0 items-center gap-2.5">
                            {attachment.type?.startsWith('image/') ? (
                              <img
                                src={attachment.url}
                                alt="Attachment preview"
                                className="size-10 shrink-0 rounded-md border border-border object-cover"
                              />
                            ) : (
                              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                                <FileText className="size-5 text-primary" />
                              </div>
                            )}

                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-foreground">
                                {attachment.name}
                              </p>

                              {attachment.size && (
                                <p className="text-[10px] text-muted-foreground">
                                  {(attachment.size / 1024).toFixed(1)} KB
                                </p>
                              )}
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={removeAttachment}
                            className="h-8 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-500"
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* FEATURE FORM */
                  <>
                    {/* Title */}
                    <div className="space-y-1.5">
                      <label className={labelClass}>
                        Title
                        <span className="text-destructive">*</span>
                      </label>

                      <Input
                        value={title}
                        onChange={(event) => {
                          setTitle(event.target.value)

                          if (event.target.value.trim()) {
                            clearError('title')
                          }
                        }}
                        onBlur={() => handleFieldBlur('title')}
                        placeholder="Enter feature task title"
                        disabled={isSubmitting}
                        className={cn(
                          'h-10 bg-background',
                          errors.title && 'border-destructive'
                        )}
                      />

                      {errors.title && (
                        <p className="text-xs text-destructive">
                          {errors.title}
                        </p>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                      <label className={labelClass}>Description</label>

                      <Textarea
                        value={description}
                        onChange={(event) =>
                          setDescription(event.target.value)
                        }
                        placeholder="Enter task description..."
                        disabled={isSubmitting}
                        className="resize-none bg-background text-xs"
                        rows={3}
                      />
                    </div>

                    {/* Add Note */}
                    {noteField}

                    {/* Priority */}
                    {priorityField}
                  </>
                )}

                {/* Due Date */}
                {dueDateField}
              </>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateModal}
                disabled={isSubmitting}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className={cn('gap-2 font-semibold', submitTheme)}
              >
                <SubmitIcon className="size-4" />
                {submitLabel}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
