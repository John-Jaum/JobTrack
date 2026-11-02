<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkRecord extends Model
{
    protected $primaryKey = 'work_record_id';

    protected $fillable = [
        'job_order_id',
        'technician_id',
        'work_description',
        'hours_spent',
        'worked_at',
    ];

    protected $casts = [
        'hours_spent' => 'decimal:2',
        'worked_at' => 'datetime',
    ];

    public function jobOrder()
    {
        return $this->belongsTo(
            JobOrder::class,
            'job_order_id',
            'job_order_id'
        );
    }

    public function technician()
    {
        return $this->belongsTo(
            User::class,
            'technician_id',
            'user_id'
        );
    }
}