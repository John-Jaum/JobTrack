<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Location extends Model { protected $primaryKey='location_id'; protected $fillable=['building_name','floor','room_number','description']; public function getNameAttribute(){ return trim($this->building_name.($this->room_number ? ', Room '.$this->room_number : '')); } }
