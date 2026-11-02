<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobOrderStatusHistory extends Model
{
    protected $table = 'job_order_status_history';

    protected $primaryKey = 'history_id';

    public $timestamps = false;

    protected $fillable = [
        'job_order_id',
        'from_status_id',
        'to_status_id',
        'event',
        'changed_by',
        'changed_at',
        'remarks'
    ];

    protected $casts = [
        'changed_at' => 'datetime'
    ];

    public function jobOrder()
    {
        return $this->belongsTo(
            JobOrder::class,
            'job_order_id',
            'job_order_id'
        );
    }

    public function fromStatus()
    {
        return $this->belongsTo(
            JobOrderStatus::class,
            'from_status_id',
            'status_id'
        );
    }

    public function toStatus()
    {
        return $this->belongsTo(
            JobOrderStatus::class,
            'to_status_id',
            'status_id'
        );
    }

    public function changedBy()
    {
        return $this->belongsTo(
            User::class,
            'changed_by',
            'user_id'
        );
    }
}