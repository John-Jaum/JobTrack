<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JobOrder;
use App\Models\MaintenanceRequest;
use App\Models\JobOrderStatus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class JobOrderController extends Controller
{
    private function role(Request $r): string { return (string) $r->user()->role?->role_name; }
    private function visible(Request $r) {
        $role = $this->role($r);
        $q = JobOrder::with([
            'maintenanceRequest.location',
            'maintenanceRequest.category',
            'maintenanceRequest.status',
            'status',
            'createdBy',
            'assignments.technician'
        ]);
        if ($role === 'Requester') abort(403);
        if ($role === 'Technician') $q->whereHas('assignments', fn($a) => $a->where('technician_id',$r->user()->user_id)->where('assignment_status','!=','Declined'));
        return $q;
    }
    private function shape(JobOrder $j): array {
        return ['job_order_id'=>$j->job_order_id,'request_id'=>$j->request_id,'status_id'=>$j->status_id,'status_label'=>$j->status?->status_name,'priority'=>$j->priority,'approved_at'=>optional($j->approved_at)->toISOString(),'closed_at'=>optional($j->closed_at)->toISOString(),'created_at'=>optional($j->created_at)->toISOString(),
            'created_by' => $j->createdBy ? [
                'user_id' => $j->createdBy->user_id,
                'full_name' => $j->createdBy->full_name
            ] : null,
            'request'=>$j->maintenanceRequest ? ['request_id'=>$j->maintenanceRequest->request_id,'reference'=>'MR-'.str_pad((string)$j->maintenanceRequest->request_id,4,'0',STR_PAD_LEFT),'description'=>$j->maintenanceRequest->description,'status_label'=>$j->maintenanceRequest->status?->status_name,'location_label'=>$j->maintenanceRequest->location?->name,'category_label'=>$j->maintenanceRequest->category?->category_name] : null,'assignments'=>$j->assignments->map(fn($a)=>['technician_id'=>$a->technician_id,'technician_name'=>$a->technician?->full_name,'assignment_role'=>$a->assignment_role,'assignment_status'=>$a->assignment_status,'assigned_at'=>optional($a->assigned_at)->toISOString()])->values()];
    }
    public function index(Request $r) {
        abort_unless(in_array($this->role($r),['Facilities Officer','Technician','Inventory Staff','Administrator'],true),403);
        $p=$this->visible($r)->orderByDesc('created_at')->orderByDesc('job_order_id')->paginate(min(100,max(1,$r->integer('per_page',15))))->withQueryString();
        return response()->json(['data'=>$p->getCollection()->map(fn($j)=>$this->shape($j)),'meta'=>['current_page'=>$p->currentPage(),'per_page'=>$p->perPage(),'total'=>$p->total(),'last_page'=>$p->lastPage(),'from'=>$p->firstItem(),'to'=>$p->lastItem()]]);
    }
    public function store(Request $r) {
        abort_unless(in_array($this->role($r),['Facilities Officer','Administrator'],true),403);
        $v=$r->validate(['request_id'=>'required|integer|exists:maintenance_requests,request_id','priority'=>'required|in:Low,Medium,High,Urgent']);
        $job=DB::transaction(function() use($r,$v) {
            $request=MaintenanceRequest::where('request_id',$v['request_id'])->lockForUpdate()->firstOrFail();
            abort_if(JobOrder::where('request_id',$request->request_id)->exists(),409,'A job order already exists for this request.');
            $approved=JobOrderStatus::where('status_name','Approved')->value('status_id'); abort_if(!$approved,500,'Job-order status seed data is missing.');
            $job=JobOrder::create(['request_id'=>$request->request_id,'created_by'=>$r->user()->user_id,'status_id'=>$approved,'priority'=>$v['priority'],'approved_at'=>now()]);
            return $job;
        });
        return response()->json([
            'data' => $this->shape(
                $job->fresh()->load([
                    'maintenanceRequest.location',
                    'maintenanceRequest.category',
                    'maintenanceRequest.status',
                    'status',
                    'createdBy',
                    'assignments.technician'
                ])
            )
        ], 201);
    }
    public function show(Request $r, string $jobOrderId) { $j=$this->visible($r)->where('job_order_id',$jobOrderId)->firstOrFail(); return response()->json(['data'=>$this->shape($j)]); }
    public function update(Request $r, string $jobOrderId) {
        abort_unless(in_array($this->role($r),['Facilities Officer','Administrator'],true),403); $j=JobOrder::findOrFail($jobOrderId);
        $v=$r->validate(['priority'=>'sometimes|in:Low,Medium,High,Urgent']); $j->update($v);
        return response()->json([
            'data' => $this->shape(
                $j->fresh()->load([
                    'maintenanceRequest.location',
                    'maintenanceRequest.category',
                    'maintenanceRequest.status',
                    'status',
                    'createdBy',
                    'assignments.technician'
                ])
            )
        ]);
    }
}
