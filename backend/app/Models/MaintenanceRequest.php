<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaintenanceRequest extends Model
{
    protected $primaryKey = 'request_id';
    protected $fillable = ['requester_id','location_id','category_id','status_id','description','priority','submitted_at','reviewed_by','reviewed_at'];
    protected $casts = ['submitted_at'=>'datetime','reviewed_at'=>'datetime'];
    public function requester() { return $this->belongsTo(User::class, 'requester_id', 'user_id'); }
    public function location() { return $this->belongsTo(Location::class, 'location_id', 'location_id'); }
    public function category() { return $this->belongsTo(MaintenanceCategory::class, 'category_id', 'category_id'); }
    public function status() { return $this->belongsTo(RequestStatus::class, 'status_id', 'status_id'); }
    public function attachments() { return $this->hasMany(RequestAttachment::class, 'request_id', 'request_id'); }
    public function jobOrder() { return $this->hasOne(JobOrder::class, 'request_id', 'request_id'); }
}
