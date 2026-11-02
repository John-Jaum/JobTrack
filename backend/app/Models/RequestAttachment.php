<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class RequestAttachment extends Model { protected $primaryKey='attachment_id'; protected $fillable=['request_id','uploaded_by','file_path','original_name','mime_type','size_bytes']; protected $casts=['size_bytes'=>'integer']; public function request(){return $this->belongsTo(MaintenanceRequest::class,'request_id','request_id');} }
