<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JobOrder;
use App\Models\MaintenanceRequest;
use App\Models\JobOrderStatus;
use App\Models\JobOrderStatusHistory;
use App\Models\JobAssignment;
use App\Models\Notification;
use App\Models\User;
use App\Models\WorkRecord;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class JobOrderController extends Controller
{
    private function role(Request $r): string
    {
        return (string) $r->user()->role?->role_name;
    }

    private function visible(Request $r)
    {
        $role = $this->role($r);

        $q = JobOrder::with([
            'maintenanceRequest.location',
            'maintenanceRequest.category',
            'maintenanceRequest.status',
            'status',
            'createdBy',
            'assignments.technician',
            'assignments.assignedBy'
        ]);

        if ($role === 'Requester') {
            abort(403);
        }

        if ($role === 'Technician') {
            $q->whereHas('assignments', function ($a) use ($r) {
                $a->where('technician_id', $r->user()->user_id)
                  ->where('assignment_status', '!=', 'Declined');
            });
        }

        return $q;
    }

    private function assignmentShape(JobAssignment $a): array
    {
        return [
            'assignment_id' => $a->assignment_id,
            'job_order_id' => $a->job_order_id,
            'technician_id' => $a->technician_id,

            'technician' => $a->technician ? [
                'user_id' => $a->technician->user_id,
                'full_name' => $a->technician->full_name
            ] : null,

            'assigned_by' => $a->assignedBy ? [
                'user_id' => $a->assignedBy->user_id,
                'full_name' => $a->assignedBy->full_name
            ] : null,

            'assignment_role' => $a->assignment_role,
            'assignment_status' => $a->assignment_status,
            'assigned_at' => optional($a->assigned_at)->toISOString(),
            'responded_at' => optional($a->responded_at)->toISOString(),
            'notes' => $a->notes,

            // Backward compatibility with existing frontend code
            'technician_name' => $a->technician?->full_name
        ];
    }

    private function shape(JobOrder $j): array
    {
        return [
            'job_order_id' => $j->job_order_id,
            'request_id' => $j->request_id,
            'status_id' => $j->status_id,
            'status_label' => $j->status?->status_name,
            'priority' => $j->priority,
            'approved_at' => optional($j->approved_at)->toISOString(),
            'closed_at' => optional($j->closed_at)->toISOString(),
            'created_at' => optional($j->created_at)->toISOString(),

            'created_by' => $j->createdBy ? [
                'user_id' => $j->createdBy->user_id,
                'full_name' => $j->createdBy->full_name
            ] : null,

            'request' => $j->maintenanceRequest ? [
                'request_id' => $j->maintenanceRequest->request_id,
                'reference' => 'MR-' . str_pad(
                    (string) $j->maintenanceRequest->request_id,
                    4,
                    '0',
                    STR_PAD_LEFT
                ),
                'description' => $j->maintenanceRequest->description,
                'status_label' => $j->maintenanceRequest->status?->status_name,
                'location_label' => $j->maintenanceRequest->location?->name,
                'category_label' => $j->maintenanceRequest->category?->category_name
            ] : null,

            'assignments' => $j->assignments
                ->map(fn($a) => $this->assignmentShape($a))
                ->values()
        ];
    }

    public function index(Request $r)
    {
        abort_unless(
            in_array($this->role($r), [
                'Facilities Officer',
                'Technician',
                'Inventory Staff',
                'Administrator'
            ], true),
            403
        );

        $p = $this->visible($r)
            ->orderByDesc('created_at')
            ->orderByDesc('job_order_id')
            ->paginate(
                min(100, max(1, $r->integer('per_page', 15)))
            )
            ->withQueryString();

        return response()->json([
            'data' => $p->getCollection()->map(
                fn($j) => $this->shape($j)
            ),
            'meta' => [
                'current_page' => $p->currentPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
                'last_page' => $p->lastPage(),
                'from' => $p->firstItem(),
                'to' => $p->lastItem()
            ]
        ]);
    }

    public function store(Request $r)
    {
        abort_unless(
            in_array($this->role($r), [
                'Facilities Officer',
                'Administrator'
            ], true),
            403
        );

        $v = $r->validate([
            'request_id' => 'required|integer|exists:maintenance_requests,request_id',
            'priority' => 'required|in:Low,Medium,High,Urgent'
        ]);

        $job = DB::transaction(function () use ($r, $v) {
            $request = MaintenanceRequest::where(
                'request_id',
                $v['request_id']
            )->lockForUpdate()->firstOrFail();

            abort_if(
                JobOrder::where('request_id', $request->request_id)->exists(),
                409,
                'A job order already exists for this request.'
            );

            $approved = JobOrderStatus::where(
                'status_name',
                'Approved'
            )->value('status_id');

            abort_if(
                !$approved,
                500,
                'Job-order status seed data is missing.'
            );

            return JobOrder::create([
                'request_id' => $request->request_id,
                'created_by' => $r->user()->user_id,
                'status_id' => $approved,
                'priority' => $v['priority'],
                'approved_at' => now()
            ]);
        });

        return response()->json([
            'data' => $this->shape(
                $job->fresh()->load([
                    'maintenanceRequest.location',
                    'maintenanceRequest.category',
                    'maintenanceRequest.status',
                    'status',
                    'createdBy',
                    'assignments.technician',
                    'assignments.assignedBy'
                ])
            )
        ], 201);
    }

    public function show(Request $r, string $jobOrderId)
    {
        $j = $this->visible($r)
            ->where('job_order_id', $jobOrderId)
            ->firstOrFail();

        return response()->json([
            'data' => $this->shape($j)
        ]);
    }

    public function update(Request $r, string $jobOrderId)
    {
        abort_unless(
            in_array($this->role($r), [
                'Facilities Officer',
                'Administrator'
            ], true),
            403
        );

        $j = JobOrder::findOrFail($jobOrderId);

        $v = $r->validate([
            'priority' => 'sometimes|in:Low,Medium,High,Urgent'
        ]);

        $j->update($v);

        return response()->json([
            'data' => $this->shape(
                $j->fresh()->load([
                    'maintenanceRequest.location',
                    'maintenanceRequest.category',
                    'maintenanceRequest.status',
                    'status',
                    'createdBy',
                    'assignments.technician',
                    'assignments.assignedBy'
                ])
            )
        ]);
    }

    /**
     * Retrieve assignments belonging to a job order.
     */
    public function assignments(Request $r, string $jobOrderId)
    {
        abort_unless(
            in_array($this->role($r), [
                'Facilities Officer',
                'Technician',
                'Inventory Staff',
                'Administrator'
            ], true),
            403
        );

        $job = $this->visible($r)
            ->where('job_order_id', $jobOrderId)
            ->firstOrFail();

        return response()->json([
            'data' => $job->assignments
                ->map(fn($a) => $this->assignmentShape($a))
                ->values()
        ]);
    }

    /**
     * Assign a technician to a job order.
     */
    public function assignTechnician(Request $r, string $jobOrderId)
    {
        abort_unless(
            in_array($this->role($r), [
                'Facilities Officer',
                'Administrator'
            ], true),
            403
        );

        $v = $r->validate([
            'technician_id' => 'required|integer|exists:users,user_id',
            'assignment_role' => 'sometimes|in:Lead,Support',
            'notes' => 'nullable|string|max:255'
        ]);

        $assignment = DB::transaction(function () use ($r, $v, $jobOrderId) {

            // Lock the job order to protect against simultaneous assignments.
            $job = JobOrder::where(
                'job_order_id',
                $jobOrderId
            )->lockForUpdate()->firstOrFail();

            $technician = User::with('role')
                ->where('user_id', $v['technician_id'])
                ->first();

            abort_if(
                !$technician ||
                !$technician->is_active ||
                $technician->role?->role_name !== 'Technician',
                422,
                'The selected user must be an active Technician.'
            );

            // Prevent duplicate technician assignments.
            $duplicate = JobAssignment::where(
                'job_order_id',
                $job->job_order_id
            )->where(
                'technician_id',
                $technician->user_id
            )->exists();

            abort_if(
                $duplicate,
                409,
                'This technician is already assigned to the job order.'
            );

            $assignmentRole = $v['assignment_role'] ?? 'Lead';

            // Only one active Lead assignment is allowed per job order.
            if ($assignmentRole === 'Lead') {
                $existingLead = JobAssignment::where(
                    'job_order_id',
                    $job->job_order_id
                )->where(
                    'assignment_role',
                    'Lead'
                )->where(
                    'assignment_status',
                    '!=',
                    'Declined'
                )->exists();

                abort_if(
                    $existingLead,
                    409,
                    'This job order already has a Lead technician.'
                );
            }

            $assignment = JobAssignment::create([
                'job_order_id' => $job->job_order_id,
                'technician_id' => $technician->user_id,
                'assigned_by' => $r->user()->user_id,
                'assignment_role' => $assignmentRole,
                'assignment_status' => 'Assigned',
                'assigned_at' => now(),
                'notes' => $v['notes'] ?? null
            ]);

            // Change Approved job orders to Assigned.
            $job->load('status');

            if ($job->status?->status_name === 'Approved') {
                $assignedStatusId = JobOrderStatus::where(
                    'status_name',
                    'Assigned'
                )->value('status_id');

                abort_if(
                    !$assignedStatusId,
                    500,
                    'Assigned job-order status seed data is missing.'
                );

                $job->update([
                    'status_id' => $assignedStatusId
                ]);
            }

            // Notify the assigned technician.
            $notificationTypeId = DB::table('notification_types')
                ->where('type_name', 'Job Assigned')
                ->value('type_id');

            abort_if(
                !$notificationTypeId,
                500,
                'Job Assigned notification type is missing.'
            );

            Notification::create([
                'user_id' => $technician->user_id,
                'job_order_id' => $job->job_order_id,
                'notification_type_id' => $notificationTypeId,
                'title' => 'New Job Assignment',
                'message' => 'You have been assigned as ' .
                    $assignmentRole .
                    ' technician to Job Order #' .
                    $job->job_order_id . '.'
            ]);

            return $assignment->load([
                'technician',
                'assignedBy'
            ]);
        });

        return response()->json([
            'data' => $this->assignmentShape($assignment)
        ], 201);
    }

    /**
     * Allow a technician to accept or decline their assignment.
     */
    public function respondToAssignment(Request $r, string $jobOrderId)
    {
        abort_unless(
            $this->role($r) === 'Technician',
            403
        );

        $v = $r->validate([
            'response' => 'required|in:accept,decline'
        ]);

        $assignment = DB::transaction(function () use (
            $r,
            $jobOrderId,
            $v
        ) {
            $assignment = JobAssignment::where(
                'job_order_id',
                $jobOrderId
            )->where(
                'technician_id',
                $r->user()->user_id
            )->lockForUpdate()->firstOrFail();

            abort_if(
                $assignment->assignment_status !== 'Assigned',
                409,
                'This assignment has already been responded to.'
            );

            $assignment->update([
                'assignment_status' =>
                    $v['response'] === 'accept'
                        ? 'Accepted'
                        : 'Declined',
                'responded_at' => now()
            ]);

            return $assignment->fresh()->load([
                'technician',
                'assignedBy'
            ]);
        });

        return response()->json([
            'message' => 'Assignment response recorded successfully.',
            'data' => $this->assignmentShape($assignment)
        ]);
    }

    /**
     * Start a job order as its accepted Lead Technician.
     */
    public function startJob(Request $r, string $jobOrderId)
    {
        abort_unless(
            $this->role($r) === 'Technician',
            403
        );

        $job = DB::transaction(function () use ($r, $jobOrderId) {

            $job = JobOrder::where(
                'job_order_id',
                $jobOrderId
            )->lockForUpdate()->firstOrFail();

            $assignment = JobAssignment::where(
                'job_order_id',
                $job->job_order_id
            )->where(
                'technician_id',
                $r->user()->user_id
            )->where(
                'assignment_role',
                'Lead'
            )->where(
                'assignment_status',
                'Accepted'
            )->first();

            abort_unless(
                $assignment,
                403,
                'Only the accepted Lead Technician can start this job.'
            );

            $job->load('status');

            abort_unless(
                $job->status?->status_name === 'Assigned',
                409,
                'Only Assigned job orders can be started.'
            );

            $inProgressStatusId = JobOrderStatus::where(
                'status_name',
                'In Progress'
            )->value('status_id');

            abort_if(
                !$inProgressStatusId,
                500,
                'In Progress job-order status is missing.'
            );

            // Preserve the previous status before updating.
            $previousStatusId = $job->status_id;

            // Record the actual transition timestamp.
            $changedAt = now();

            // Update the Job Order status.
            $job->update([
                'status_id' => $inProgressStatusId
            ]);

            // Record the status transition in the audit history.
            JobOrderStatusHistory::create([
                'job_order_id' => $job->job_order_id,
                'from_status_id' => $previousStatusId,
                'to_status_id' => $inProgressStatusId,
                'event' => 'Status Change',
                'changed_by' => $r->user()->user_id,
                'changed_at' => $changedAt,
                'remarks' => 'Job started by the accepted Lead Technician.'
            ]);

            return $job->fresh()->load([
                'maintenanceRequest.location',
                'maintenanceRequest.category',
                'maintenanceRequest.status',
                'status',
                'createdBy',
                'assignments.technician',
                'assignments.assignedBy'
            ]);
        });

        return response()->json([
            'message' => 'Job started successfully.',
            'data' => $this->shape($job)
        ]);
    }

    /**
    * Retrieve work records for a job order.
     */
    public function workRecords(Request $r, string $jobOrderId)
    {
        abort_unless(
            in_array($this->role($r), [
                'Facilities Officer',
                'Technician',
                'Inventory Staff',
                'Administrator'
            ], true),
            403
        );

        $job = $this->visible($r)
            ->where('job_order_id', $jobOrderId)
            ->firstOrFail();

        $records = $job->workRecords()
            ->with('technician')
            ->orderByDesc('worked_at')
            ->orderByDesc('work_record_id')
            ->get()
            ->map(function ($record) {
                return [
                    'work_record_id' => $record->work_record_id,
                    'job_order_id' => $record->job_order_id,
                    'technician' => $record->technician ? [
                        'user_id' => $record->technician->user_id,
                        'full_name' => $record->technician->full_name
                    ] : null,
                    'work_description' => $record->work_description,
                    'hours_spent' => $record->hours_spent,
                    'worked_at' => optional(
                        $record->worked_at
                    )->toISOString()
                ];
            });

        return response()->json([
            'data' => $records
        ]);
    }

    /**
     * Submit a work record as an assigned Technician.
     */
    public function storeWorkRecord(Request $r, string $jobOrderId)
    {
        abort_unless(
            $this->role($r) === 'Technician',
            403
        );

        $v = $r->validate([
            'work_description' => 'required|string',
            'hours_spent' => 'nullable|numeric|min:0|max:9999.99',
            'worked_at' => 'sometimes|nullable|date'
        ]);

        $record = DB::transaction(function () use (
            $r,
            $jobOrderId,
            $v
        ) {
            $job = JobOrder::where(
                'job_order_id',
                $jobOrderId
            )->lockForUpdate()->firstOrFail();

            $assignment = JobAssignment::where(
                'job_order_id',
                $job->job_order_id
            )->where(
                'technician_id',
                $r->user()->user_id
            )->where(
                'assignment_status',
                'Accepted'
            )->exists();

            abort_unless(
                $assignment,
                403,
                'You must have an accepted assignment to record work.'
            );

            $job->load('status');

            abort_unless(
                $job->status?->status_name === 'In Progress',
                409,
                'Work records can only be submitted while the job is In Progress.'
            );

            return WorkRecord::create([
                'job_order_id' => $job->job_order_id,
                'technician_id' => $r->user()->user_id,
                'work_description' => $v['work_description'],
                'hours_spent' => $v['hours_spent'] ?? null,
                'worked_at' => $v['worked_at'] ?? now()
            ])->load('technician');
        });

        return response()->json([
            'message' => 'Work record submitted successfully.',
            'data' => [
                'work_record_id' => $record->work_record_id,
                'job_order_id' => $record->job_order_id,
                'technician' => [
                    'user_id' => $record->technician->user_id,
                    'full_name' => $record->technician->full_name
                ],
                'work_description' => $record->work_description,
                'hours_spent' => $record->hours_spent,
                'worked_at' => optional(
                    $record->worked_at
                )->toISOString()
            ]
        ], 201);
    }

    /**
    * Complete a job order as its accepted Lead Technician.
     */
    public function completeJob(Request $r, string $jobOrderId)
    {
        abort_unless(
            $this->role($r) === 'Technician',
            403
        );

        $job = DB::transaction(function () use ($r, $jobOrderId) {

            $job = JobOrder::where(
                'job_order_id',
                $jobOrderId
            )->lockForUpdate()->firstOrFail();

            $assignment = JobAssignment::where(
                'job_order_id',
                $job->job_order_id
            )->where(
                'technician_id',
                $r->user()->user_id
            )->where(
                'assignment_role',
                'Lead'
            )->where(
                'assignment_status',
                'Accepted'
            )->exists();

            abort_unless(
                $assignment,
                403,
                'Only the accepted Lead Technician can complete this job.'
            );

            $job->load('status');

            abort_unless(
                $job->status?->status_name === 'In Progress',
                409,
                'Only In Progress job orders can be completed.'
            );

            $completedStatusId = JobOrderStatus::where(
                'status_name',
                'Completed'
            )->value('status_id');

            abort_if(
                !$completedStatusId,
                500,
                'Completed job-order status is missing.'
            );

            // Preserve the previous status before updating.
            $previousStatusId = $job->status_id;

            // Record the actual transition timestamp.
            $changedAt = now();

            // Update the Job Order status.
            // Do not set closed_at yet; the Requester has not acknowledged it.
            $job->update([
                'status_id' => $completedStatusId
            ]);

            // Record the status transition in the audit history.
            JobOrderStatusHistory::create([
                'job_order_id' => $job->job_order_id,
                'from_status_id' => $previousStatusId,
                'to_status_id' => $completedStatusId,
                'event' => 'Status Change',
                'changed_by' => $r->user()->user_id,
                'changed_at' => $changedAt,
                'remarks' => 'Job completed by the accepted Lead Technician.'
            ]);

            // Also mark the linked Maintenance Request as Completed.
            $completedRequestStatusId = DB::table('request_statuses')
                ->where('status_name', 'Completed')
                ->value('status_id');

            abort_if(
                !$completedRequestStatusId,
                500,
                'Completed maintenance-request status is missing.'
            );

            MaintenanceRequest::where(
                'request_id',
                $job->request_id
            )->update([
                'status_id' => $completedRequestStatusId
            ]);

            // Mark all accepted technicians' assignments as completed.
            JobAssignment::where(
                'job_order_id',
                $job->job_order_id
            )->where(
                'assignment_status',
                'Accepted'
            )->update([
                'assignment_status' => 'Completed'
            ]);

            return $job->fresh()->load([
                'maintenanceRequest.location',
                'maintenanceRequest.category',
                'maintenanceRequest.status',
                'status',
                'createdBy',
                'assignments.technician',
                'assignments.assignedBy'
            ]);
        });

        return response()->json([
            'message' => 'Job completed successfully.',
            'data' => $this->shape($job)
        ]);
    }

}
