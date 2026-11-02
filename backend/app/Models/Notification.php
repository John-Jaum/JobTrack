<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $primaryKey = 'notification_id';

    protected $fillable = [
        'user_id',
        'job_order_id',
        'notification_type_id',
        'title',
        'message',
        'read_at',
    ];

    protected $casts = [
        'read_at' => 'datetime',
    ];
    public function type()
    {
        return $this->belongsTo(
            \App\Models\NotificationType::class,
            'notification_type_id',
            'type_id'
        );
    }

}
