<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobOrder extends Model
{
    protected $primaryKey = 'job_order_id';

    protected $fillable = [
        'request_id',
        'created_by',
        'status_id',
        'priority',
        'approved_at',
        'closed_at'
    ];

    protected $casts = [
        'approved_at' => 'datetime',
        'closed_at' => 'datetime'
    ];

    public function maintenanceRequest()
    {
        return $this->belongsTo(
            MaintenanceRequest::class,
            'request_id',
            'request_id'
        );
    }

    public function status()
    {
        return $this->belongsTo(
            JobOrderStatus::class,
            'status_id',
            'status_id'
        );
    }

    public function assignments()
    {
        return $this->hasMany(
            JobAssignment::class,
            'job_order_id',
            'job_order_id'
        );
    }

    public function workRecords()
    {
        return $this->hasMany(
            WorkRecord::class,
            'job_order_id',
            'job_order_id'
        );
    }


    // The user who created the job order.
    public function createdBy()
    {
        return $this->belongsTo(
            User::class,
            'created_by',
            'user_id'
        );
    }

    public function statusHistory()
    {
        return $this->hasMany(
            JobOrderStatusHistory::class,
            'job_order_id',
            'job_order_id'
        )->orderBy('changed_at', 'asc');
    }


}
