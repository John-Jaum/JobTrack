<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Material extends Model
{
    protected $primaryKey = 'material_id';

    protected $fillable = [
        'material_name',
        'unit',
        'current_stock',
        'reorder_level',
        'description',
        'is_active',
    ];

    protected $casts = [
        'current_stock' => 'integer',
        'reorder_level' => 'integer',
        'is_active' => 'boolean',
    ];
}
