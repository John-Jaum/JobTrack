<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class RequestStatus extends Model { protected $primaryKey='status_id'; protected $fillable=['status_name']; }
