<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;
    protected $primaryKey = 'user_id';
    protected $fillable = ['role_id','full_name','email','password_hash','phone_number','is_active'];
    protected $hidden = ['password_hash','remember_token'];
    protected $casts = ['is_active'=>'boolean','email_verified_at'=>'datetime'];
    public function getAuthPassword() { return $this->password_hash; }
    public function role() { return $this->belongsTo(Role::class, 'role_id', 'role_id'); }
    public function maintenanceRequests() { return $this->hasMany(MaintenanceRequest::class, 'requester_id', 'user_id'); }
}
