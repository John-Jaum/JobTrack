<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request)
    {
        // Only Administrators may list user accounts.
        abort_unless(
            $request->user()?->role?->role_name === 'Administrator',
            403,
            'You are not authorized to manage users.'
        );

        $query = User::query()
            ->with('role:role_id,role_name')
            ->select([
                'user_id',
                'role_id',
                'full_name',
                'email',
                'phone_number',
                'is_active',
                'created_at',
            ]);

        // Search by name or email.
        if ($request->filled('q')) {
            $search = trim($request->query('q'));

            $query->where(function ($subquery) use ($search) {
                $subquery
                    ->where('full_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        // Filter by role.
        if ($request->filled('role_id')) {
            $query->where('role_id', $request->query('role_id'));
        }

        // Preserve false/0 as a valid inactive filter.
        if ($request->has('is_active')
            && in_array((string) $request->query('is_active'), ['0', '1'], true)) {
            $query->where(
                'is_active',
                (int) $request->query('is_active')
            );
        }

        $perPage = min(
            max((int) $request->query('per_page', 10), 1),
            100
        );

        $page = max((int) $request->query('page', 1), 1);

        $users = $query
            ->orderBy('full_name')
            ->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'data' => $users->items(),
            'meta' => [
                'current_page' => $users->currentPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
                'last_page' => $users->lastPage(),
            ],
        ]);
    }
}
