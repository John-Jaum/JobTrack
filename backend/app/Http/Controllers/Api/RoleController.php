<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function index(Request $request)
    {
        $roleName = $request->user()?->role?->role_name;

        abort_unless(
            in_array($roleName, ['Administrator', 'Facilities Officer'], true),
            403,
            'You are not authorized to view roles.'
        );

        $perPage = min(
            max((int) $request->query('per_page', 15), 1),
            100
        );

        $page = max((int) $request->query('page', 1), 1);

        $roles = Role::query()
            ->orderBy('role_name')
            ->paginate(
                $perPage,
                ['role_id', 'role_name', 'description'],
                'page',
                $page
            );

        return response()->json([
            'data' => $roles->items(),
            'meta' => [
                'current_page' => $roles->currentPage(),
                'per_page' => $roles->perPage(),
                'total' => $roles->total(),
                'last_page' => $roles->lastPage(),
            ],
        ]);
    }
}
