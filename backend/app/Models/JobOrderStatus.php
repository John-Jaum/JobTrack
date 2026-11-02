<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; class JobOrderStatus extends Model { protected $primaryKey='status_id'; protected $table='job_order_statuses'; protected $fillable=['status_name']; }
