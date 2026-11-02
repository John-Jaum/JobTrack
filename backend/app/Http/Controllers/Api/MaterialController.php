<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Material;
use Illuminate\Http\Request;

class MaterialController extends Controller
{
    public function index(Request $request)
    {
        $roleName = $request->user()?->role?->role_name;

        abort_unless(
            in_array($roleName, [
                'Administrator',
                'Inventory Officer',
            ], true),
            403,
            'You are not authorized to view materials.'
        );

        $perPage = min(
            max((int) $request->query('per_page', 10), 1),
            100
        );

        $page = max((int) $request->query('page', 1), 1);

        $materials = Material::query()
            ->orderBy('material_name')
            ->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'data' => $materials->items(),
            'meta' => [
                'current_page' => $materials->currentPage(),
                'per_page' => $materials->perPage(),
                'total' => $materials->total(),
                'last_page' => $materials->lastPage(),
            ],
        ]);
    }
}
