<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller; use App\Models\MaintenanceRequest; use App\Models\RequestStatus; use App\Models\Notification; use Illuminate\Http\Request; use Illuminate\Support\Facades\DB; use App\Models\JobOrder; use App\Models\JobOrderStatus;
class MaintenanceRequestController extends Controller
{
 private function role(Request $r): string { return (string)$r->user()->role?->role_name; }
 private function base(Request $r) { $role=$this->role($r); $q=MaintenanceRequest::query()->with(['requester','location','category','status'])->withCount('attachments'); if($role==='Requester') $q->where('requester_id',$r->user()->user_id); elseif($role==='Technician') $q->whereHas('jobOrder.assignments',fn($a)=>$a->where('technician_id',$r->user()->user_id)->where('assignment_status','!=','Declined')); elseif($role==='Inventory Staff') abort(403); return $q; }
 private function shape($m): array { return ['request_id'=>$m->request_id,'reference'=>'MR-'.str_pad((string)$m->request_id,4,'0',STR_PAD_LEFT),'requester_id'=>$m->requester_id,'requester'=>$m->requester?['user_id'=>$m->requester->user_id,'full_name'=>$m->requester->full_name]:null,'location_id'=>$m->location_id,'location_label'=>$m->location?->name,'category_id'=>$m->category_id,'category_label'=>$m->category?->category_name,'status_id'=>$m->status_id,'status_label'=>$m->status?->status_name,'description'=>$m->description,'priority'=>$m->priority,'submitted_at'=>optional($m->submitted_at)->toISOString(),'created_at'=>optional($m->created_at)->toISOString(),'attachment_count'=>(int)$m->attachments_count]; }
 public function index(Request $r) { $data=$this->base($r); if($r->filled('status_id'))$data->where('status_id',$r->integer('status_id')); if($r->filled('q'))$data->where(fn($q)=>$q->where('description','like','%'.$r->string('q').'%')); $p=$data->orderByDesc('created_at')->orderByDesc('request_id')->paginate(min(100,max(1,$r->integer('per_page',15))))->withQueryString(); return response()->json(['data'=>$p->getCollection()->map(fn($m)=>$this->shape($m)),'meta'=>['current_page'=>$p->currentPage(),'per_page'=>$p->perPage(),'total'=>$p->total(),'last_page'=>$p->lastPage(),'from'=>$p->firstItem(),'to'=>$p->lastItem()]]); }
 public function myRequests(Request $r) { return $this->index($r); }
 public function store(Request $r) { abort_unless(in_array($this->role($r),['Requester','Facilities Officer','Administrator'],true),403); $v=$r->validate(['location_id'=>'required|integer|exists:locations,location_id','category_id'=>'required|integer|exists:maintenance_categories,category_id','description'=>'required|string|max:10000','priority'=>'required|in:Low,Medium,High,Urgent']); $pending=RequestStatus::where('status_name','Pending')->value('status_id'); abort_if(!$pending,500,'Request status seed data is missing.'); $m=MaintenanceRequest::create($v+['requester_id'=>$r->user()->user_id,'status_id'=>$pending,'submitted_at'=>now()]); return response()->json(['data'=>$this->shape($m->fresh()->load(['requester','location','category','status'])->loadCount('attachments'))],201); }
 public function show(Request $r, string $requestId) { $m=$this->base($r)->where('request_id',$requestId)->firstOrFail(); return response()->json(['data'=>$this->shape($m)]); }
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





 public function acknowledge(Request $r,string $requestId) { abort_unless($this->role($r)==='Requester',403); $m=MaintenanceRequest::with('status')->where('requester_id',$r->user()->user_id)->findOrFail($requestId); abort_if($m->status?->status_name!=='Completed',409,'Only completed requests can be acknowledged.'); return response()->json(['message'=>'Acknowledgement requires a linked completed job order.','code'=>'invalid_transition'],409); }
}
