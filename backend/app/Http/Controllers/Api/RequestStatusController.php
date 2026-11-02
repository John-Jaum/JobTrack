<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller; use App\Models\RequestStatus; use Illuminate\Http\Request;
class RequestStatusController extends Controller { public function index(Request $r){$p=RequestStatus::orderBy('status_id')->paginate(min(100,max(1,$r->integer('per_page',100))));return response()->json(['data'=>$p->getCollection()->map(fn($x)=>['id'=>$x->status_id,'label'=>$x->status_name]),'meta'=>['current_page'=>$p->currentPage(),'per_page'=>$p->perPage(),'total'=>$p->total(),'last_page'=>$p->lastPage(),'from'=>$p->firstItem(),'to'=>$p->lastItem()]]);} }
