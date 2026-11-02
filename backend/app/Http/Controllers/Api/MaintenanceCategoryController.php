<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller; use App\Models\MaintenanceCategory; use Illuminate\Http\Request;
class MaintenanceCategoryController extends Controller { public function index(Request $r){$p=MaintenanceCategory::orderBy('category_name')->paginate(min(100,max(1,$r->integer('per_page',100))));return response()->json(['data'=>$p->getCollection()->map(fn($x)=>['category_id'=>$x->category_id,'category_name'=>$x->category_name,'description'=>$x->description]),'meta'=>['current_page'=>$p->currentPage(),'per_page'=>$p->perPage(),'total'=>$p->total(),'last_page'=>$p->lastPage(),'from'=>$p->firstItem(),'to'=>$p->lastItem()]]);} }
