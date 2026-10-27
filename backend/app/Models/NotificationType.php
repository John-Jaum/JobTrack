<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotificationType extends Model
{
    protected $table = 'notification_types';

    protected $primaryKey = 'type_id';

    protected $fillable = [
        'type_name',
    ];
}
