<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller; use App\Models\MaintenanceRequest; use App\Models\RequestStatus; use App\Models\Notification; use Illuminate\Http\Request; use Illuminate\Support\Facades\DB; use App\Models\JobOrder; use App\Models\JobOrderStatus; use App\Models\User; use App\Models\JobOrderStatusHistory;
class MaintenanceRequestController extends Controller
{
 private function role(Request $r): string { return (string)$r->user()->role?->role_name; }
 private function base(Request $r) { $role=$this->role($r); $q=MaintenanceRequest::query()->with(['requester','location','category','status'])->withCount('attachments'); if($role==='Requester') $q->where('requester_id',$r->user()->user_id); elseif($role==='Technician') $q->whereHas('jobOrder.assignments',fn($a)=>$a->where('technician_id',$r->user()->user_id)->where('assignment_status','!=','Declined')); elseif($role==='Inventory Staff') abort(403); return $q; }
 private function shape($m): array { return ['request_id'=>$m->request_id,'reference'=>'MR-'.str_pad((string)$m->request_id,4,'0',STR_PAD_LEFT),'requester_id'=>$m->requester_id,'requester'=>$m->requester?['user_id'=>$m->requester->user_id,'full_name'=>$m->requester->full_name]:null,'location_id'=>$m->location_id,'location_label'=>$m->location?->name,'category_id'=>$m->category_id,'category_label'=>$m->category?->category_name,'status_id'=>$m->status_id,'status_label'=>$m->status?->status_name,'description'=>$m->description,'priority'=>$m->priority,'submitted_at'=>optional($m->submitted_at)->toISOString(),'created_at'=>optional($m->created_at)->toISOString(),'attachment_count'=>(int)$m->attachments_count]; }
 public function index(Request $r)
 {
    $data = $this->base($r);

    // Filter by request status.
    if ($r->filled('status_id')) {
        $data->where('status_id', $r->integer('status_id'));
    }

    // Filter by priority.
    if ($r->filled('priority')) {
        $data->where('priority', $r->string('priority')->toString());
    }

    // Search across reference, requester, description,
    // maintenance category, and location.
    if ($r->filled('q')) {
        $search = trim($r->string('q')->toString());

        $data->where(function ($query) use ($search) {

            // Search request description.
            $query->where('description', 'like', "%{$search}%");

            // Search requester's full name.
            $query->orWhereHas('requester', function ($requesterQuery) use ($search) {
                $requesterQuery->where(
                    'full_name',
                    'like',
                    "%{$search}%"
                );
            });

            // Search generated reference, e.g. MR-0001.
            // Supports partial searches such as M, MR, MR-00, and MR-0001.
            $query->orWhereRaw(
                "CONCAT('MR-', LPAD(request_id, 4, '0')) LIKE ?",
                ['%' . strtoupper($search) . '%']
            );

            // Search maintenance category name only.
            $query->orWhereHas('category', function ($categoryQuery) use ($search) {
                $categoryQuery->where('category_name', 'like', "%{$search}%");
            });

            // Search location fields.
            $query->orWhereHas('location', function ($locationQuery) use ($search) {
                $locationQuery->where('building_name', 'like', "%{$search}%")
                    ->orWhere('floor', 'like', "%{$search}%")
                    ->orWhere('room_number', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        });
    }

    $p = $data
        ->orderByDesc('created_at')
        ->orderByDesc('request_id')
        ->paginate(
            min(100, max(1, $r->integer('per_page', 15)))
        )
        ->withQueryString();

    return response()->json([
        'data' => $p->getCollection()->map(
            fn ($m) => $this->shape($m)
        ),
        'meta' => [
            'current_page' => $p->currentPage(),
            'per_page' => $p->perPage(),
            'total' => $p->total(),
            'last_page' => $p->lastPage(),
            'from' => $p->firstItem(),
            'to' => $p->lastItem(),
        ],
    ]);
 }
 public function myRequests(Request $r) { return $this->index($r); }

 public function store(Request $r)
 {
    abort_unless(
        in_array($this->role($r), [
            'Requester',
            'Facilities Officer',
            'Administrator'
        ], true),
        403
    );

    $v = $r->validate([
        'location_id' => 'required|integer|exists:locations,location_id',
        'category_id' => 'required|integer|exists:maintenance_categories,category_id',
        'description' => 'required|string|max:10000',
        'priority' => 'required|in:Low,Medium,High,Urgent',
    ]);

    $pending = RequestStatus::where('status_name', 'Pending')
        ->value('status_id');

    abort_if(!$pending, 500, 'Request status seed data is missing.');

    $newRequestTypeId = DB::table('notification_types')
        ->where('type_name', 'New Request')
        ->value('type_id');

    abort_if(
        !$newRequestTypeId,
        500,
        'New Request notification type is missing.'
    );

    $m = DB::transaction(function () use (
        $r,
        $v,
        $pending,
        $newRequestTypeId
    ) {
        // Create the maintenance request.
        $request = MaintenanceRequest::create(
            $v + [
                'requester_id' => $r->user()->user_id,
                'status_id' => $pending,
                'submitted_at' => now(),
            ]
        );

        // Find active Facilities Officers and Administrators.
        $recipients = User::where('is_active', true)
            ->whereHas('role', function ($query) {
                $query->whereIn('role_name', [
                    'Facilities Officer',
                    'Administrator',
                ]);
            })
            ->get(['user_id']);

        $reference = 'MR-' . str_pad(
            (string) $request->request_id,
            4,
            '0',
            STR_PAD_LEFT
        );

        // Create an individual notification for each recipient.
        foreach ($recipients as $recipient) {
            Notification::create([
                'user_id' => $recipient->user_id,
                'job_order_id' => null,
                'notification_type_id' => $newRequestTypeId,
                'title' => 'New Maintenance Request',
                'message' => "A new maintenance request {$reference} has been submitted and requires review.",
            ]);
        }

        return $request;
    });

    return response()->json([
        'data' => $this->shape(
            $m->fresh()
                ->load(['requester', 'location', 'category', 'status'])
                ->loadCount('attachments')
        ),
    ], 201);
 }

 public function show(Request $r, string $requestId)
 {
    $m = $this->base($r)
        ->where('request_id', $requestId)
        ->firstOrFail();

    // Load the linked Job Order and its status history.
    $m->load([
        'jobOrder.status',
        'jobOrder.statusHistory.fromStatus',
        'jobOrder.statusHistory.toStatus',
        'jobOrder.statusHistory.changedBy'
    ]);

    $data = $this->shape($m);

    // Include Job Order details when one exists.
    $data['job_order'] = $m->jobOrder ? [
        'job_order_id' => $m->jobOrder->job_order_id,
        'status_label' => $m->jobOrder->status?->status_name,
        'approved_at' => optional($m->jobOrder->approved_at)->toISOString(),
        'closed_at' => optional($m->jobOrder->closed_at)->toISOString(),

        'status_history' => $m->jobOrder->statusHistory
            ->map(function ($history) {
                return [
                    'history_id' => $history->history_id,
                    'event' => $history->event,
                    'from_status' => $history->fromStatus?->status_name,
                    'to_status' => $history->toStatus?->status_name,
                    'changed_by' => $history->changedBy?->full_name,
                    'changed_at' => optional($history->changed_at)->toISOString(),
                    'remarks' => $history->remarks
                ];
            })
            ->values()
    ] : null;

    return response()->json([
        'data' => $data
    ]);
 }
 public function update(Request $r,string $requestId) { $m=$this->base($r)->where('request_id',$requestId)->firstOrFail(); abort_unless(in_array($this->role($r),['Requester','Facilities Officer','Administrator'],true),403); if($this->role($r)==='Requester') abort_if($m->status?->status_name!=='Pending',409,'Only pending requests can be edited.'); $v=$r->validate(['location_id'=>'sometimes|integer|exists:locations,location_id','category_id'=>'sometimes|integer|exists:maintenance_categories,category_id','description'=>'sometimes|string|max:10000','priority'=>'sometimes|in:Low,Medium,High,Urgent']); $m->update($v); return response()->json(['data'=>$this->shape($m->fresh()->load(['requester','location','category','status'])->loadCount('attachments'))]); }
 public function destroy(Request $r,string $requestId) { abort_unless(in_array($this->role($r),['Requester','Administrator'],true),403); $m=$this->base($r)->where('request_id',$requestId)->firstOrFail(); abort_if($m->jobOrder()->exists(),409,'Requests with a job order cannot be deleted.'); $m->delete(); return response()->noContent(); }




 public function review(Request $r, string $requestId)
 {
    abort_unless(
        in_array($this->role($r), ['Facilities Officer', 'Administrator'], true),
        403
    );

    $v = $r->validate([
        'decision' => 'required|in:approve,reject',
        'remarks' => 'required_if:decision,reject|nullable|string|min:1|max:255',
    ]);

    $statusName = $v['decision'] === 'approve' ? 'Approved' : 'Rejected';

    $statusId = RequestStatus::where('status_name', $statusName)
        ->value('status_id');

    abort_if(!$statusId, 500, 'Required status seed data is missing.');

    DB::transaction(function () use ($requestId, $r, $v, $statusId, $statusName) {
        // Lock the request so concurrent reviews cannot process it twice.
        $m = MaintenanceRequest::with('status')
            ->where('request_id', $requestId)
            ->lockForUpdate()
            ->firstOrFail();

        abort_if(
            $m->status?->status_name !== 'Pending',
            409,
            'Only pending requests can be reviewed.'
        );

        $jobOrderId = null;

        if ($v['decision'] === 'approve') {
            // Find the job-order status used for newly approved jobs.
            $jobStatusId = JobOrderStatus::where('status_name', 'Approved')
                ->value('status_id');

            abort_if(
                !$jobStatusId,
                500,
                'Job-order status seed data is missing.'
            );

            // The unique request_id constraint prevents duplicate job orders.
            abort_if(
                JobOrder::where('request_id', $m->request_id)->exists(),
                409,
                'A job order already exists for this request.'
            );

            $job = JobOrder::create([
                'request_id' => $m->request_id,
                'created_by' => $r->user()->user_id,
                'status_id' => $jobStatusId,
                'priority' => $m->priority,
                'approved_at' => now(),
            ]);

            $jobOrderId = $job->job_order_id;
        }

        $m->update([
            'status_id' => $statusId,
            'reviewed_by' => $r->user()->user_id,
            'reviewed_at' => now(),
        ]);

        $typeId = DB::table('notification_types')
            ->where('type_name', 'Request Status Changed')
            ->value('type_id');

        if (!$typeId) {
            throw new \RuntimeException(
                'Request Status Changed notification type is missing.'
            );
        }

        $reference = 'MR-' . str_pad(
            (string) $m->request_id,
            4,
            '0',
            STR_PAD_LEFT
        );

        $message = "Your maintenance request {$reference} has been {$statusName}.";

        if ($v['decision'] === 'reject') {
            $message .= ' Remarks: ' . $v['remarks'];
        } elseif ($jobOrderId !== null) {
            $message .= " Job order #{$jobOrderId} has been created.";
        }

        Notification::create([
            'user_id' => $m->requester_id,
            'job_order_id' => $jobOrderId,
            'notification_type_id' => $typeId,
            'title' => "Maintenance Request {$statusName}",
            'message' => $message,
        ]);
    });

    return response()->json([
        'data' => $this->shape(
            MaintenanceRequest::findOrFail($requestId)
                ->load(['requester', 'location', 'category', 'status'])
                ->loadCount('attachments')
        ),
    ]);
 }


 public function acknowledge(Request $r, string $requestId)
 {
    abort_unless(
        $this->role($r) === 'Requester',
        403
    );

    $result = DB::transaction(function () use ($r, $requestId) {

        // Retrieve the request owned by the authenticated Requester.
        $m = MaintenanceRequest::where(
            'requester_id',
            $r->user()->user_id
        )->where(
            'request_id',
            $requestId
        )->lockForUpdate()->firstOrFail();

        $m->load('status');

        // Only completed requests can be acknowledged.
        abort_unless(
            $m->status?->status_name === 'Completed',
            409,
            'Only completed requests can be acknowledged.'
        );

        // Lock the linked Job Order.
        $jobOrder = JobOrder::where(
            'request_id',
            $m->request_id
        )->lockForUpdate()->first();

        abort_unless(
            $jobOrder,
            409,
            'No linked job order was found.'
        );

        $jobOrder->load('status');

        // The Job Order must also be completed.
        abort_unless(
            $jobOrder->status?->status_name === 'Completed',
            409,
            'The linked job order must be completed before acknowledgement.'
        );

        // Retrieve Closed statuses.
        $closedRequestStatusId = RequestStatus::where(
            'status_name',
            'Closed'
        )->value('status_id');

        $closedJobOrderStatusId = JobOrderStatus::where(
            'status_name',
            'Closed'
        )->value('status_id');

        abort_if(
            !$closedRequestStatusId || !$closedJobOrderStatusId,
            500,
            'Required Closed status is missing.'
        );

        // Retrieve the dedicated notification type.
        $notificationTypeId = DB::table('notification_types')
            ->where('type_name', 'Requester Acknowledgement')
            ->value('type_id');

        abort_if(
            !$notificationTypeId,
            500,
            'Requester Acknowledgement notification type is missing.'
        );

        // Preserve the previous Job Order status for history.
        $previousJobOrderStatusId = $jobOrder->status_id;

        // Record the acknowledgement timestamp.
        $acknowledgedAt = now();

        // Close the Job Order.
        $jobOrder->update([
            'status_id' => $closedJobOrderStatusId,
            'closed_at' => $acknowledgedAt
        ]);

        // Close the Maintenance Request.
        $m->update([
            'status_id' => $closedRequestStatusId
        ]);

        // Record the Requester acknowledgement in history.
        JobOrderStatusHistory::create([
            'job_order_id' => $jobOrder->job_order_id,
            'from_status_id' => $previousJobOrderStatusId,
            'to_status_id' => $closedJobOrderStatusId,
            'event' => 'Requester Acknowledgement',
            'changed_by' => $r->user()->user_id,
            'changed_at' => $acknowledgedAt,
            'remarks' => 'Maintenance completion acknowledged by Requester.'
        ]);

        // Collect the Facilities Officer who created the Job Order.
        $recipientIds = collect([
            $jobOrder->created_by
        ]);

        // Include all assigned technicians except declined assignments.
        $technicianIds = $jobOrder->assignments()
            ->where('assignment_status', '!=', 'Declined')
            ->pluck('technician_id');

        $recipientIds = $recipientIds
            ->merge($technicianIds)
            ->filter()
            ->unique()
            ->values();

        // Generate the Maintenance Request reference.
        $reference = 'MR-' . str_pad(
            (string) $m->request_id,
            4,
            '0',
            STR_PAD_LEFT
        );

        // Notify each recipient.
        foreach ($recipientIds as $recipientId) {
            Notification::create([
                'user_id' => $recipientId,
                'job_order_id' => $jobOrder->job_order_id,
                'notification_type_id' => $notificationTypeId,
                'title' => 'Maintenance Request Acknowledged',
                'message' => "The Requester has acknowledged the completed maintenance request {$reference}. Job Order #{$jobOrder->job_order_id} is now closed."
            ]);
        }

        return [
            'request' => $m->fresh('status'),
            'job_order' => $jobOrder->fresh('status')
        ];
    });

    return response()->json([
        'message' => 'Maintenance request acknowledged and closed successfully.',
        'data' => [
            'request_id' => $result['request']->request_id,
            'request_status' => $result['request']->status?->status_name,
            'job_order_id' => $result['job_order']->job_order_id,
            'job_order_status' => $result['job_order']->status?->status_name,
            'closed_at' => $result['job_order']->closed_at
        ]
    ]);
 }


}
