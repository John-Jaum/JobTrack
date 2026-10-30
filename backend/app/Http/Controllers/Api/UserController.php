<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    /**
     * Ensure only Administrators can manage user accounts.
     */
    private function authorizeAdmin(Request $request): void
    {
        abort_unless(
            $request->user()?->role?->role_name === 'Administrator',
            403,
            'You are not authorized to manage users.'
        );
    }

    /**
     * List users.
     */
    public function index(Request $request)
    {
        $this->authorizeAdmin($request);

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

        if ($request->filled('q')) {
            $search = trim($request->query('q'));

            $query->where(function ($subquery) use ($search) {
                $subquery
                    ->where('full_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($request->filled('role_id')) {
            $query->where('role_id', $request->query('role_id'));
        }

        if (
            $request->has('is_active')
            && in_array((string) $request->query('is_active'), ['0', '1'], true)
        ) {
            $query->where('is_active', (int) $request->query('is_active'));
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

    /**
     * Create a user account.
     */
    public function store(Request $request)
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'full_name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'phone_number' => 'nullable|string|max:30',
            'role_id' => 'required|integer|exists:roles,role_id',
            'password' => 'required|string|min:8',
            'is_active' => 'required|boolean',
        ]);

        $user = User::create([
            'full_name' => $validated['full_name'],
            'email' => $validated['email'],
            'phone_number' => $validated['phone_number'] ?? null,
            'role_id' => $validated['role_id'],
            'password_hash' => Hash::make($validated['password']),
            'is_active' => $validated['is_active'],
        ]);

        return response()->json([
            'message' => 'User account created successfully.',
            'data' => $user->load('role:role_id,role_name')
                ->makeHidden(['password_hash']),
        ], 201);
    }

    /**
     * Retrieve one user for editing.
     */
    public function show(Request $request, string $userId)
    {
        $this->authorizeAdmin($request);

        $user = User::with('role:role_id,role_name')
            ->select([
                'user_id',
                'role_id',
                'full_name',
                'email',
                'phone_number',
                'is_active',
                'created_at',
            ])
            ->findOrFail($userId);

        return response()->json([
            'data' => $user,
        ]);
    }

    /**
     * Update an existing user account.
     */
    public function update(Request $request, string $userId)
    {
        $this->authorizeAdmin($request);

        $user = User::findOrFail($userId);

        $validated = $request->validate([
            'full_name' => 'sometimes|required|string|max:255',
            'email' => [
                'sometimes',
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->user_id, 'user_id'),
            ],
            'phone_number' => 'sometimes|nullable|string|max:30',
            'role_id' => 'sometimes|required|integer|exists:roles,role_id',
            'password' => 'sometimes|nullable|string|min:8',
            'is_active' => 'sometimes|required|boolean',
        ]);

        // Prevent Administrators from disabling or demoting themselves.
        if ((int) $request->user()->user_id === (int) $user->user_id) {
            abort_if(
                isset($validated['is_active']) && !$validated['is_active'],
                422,
                'You cannot deactivate your own account.'
            );

            abort_if(
                isset($validated['role_id'])
                    && (int) $validated['role_id'] !== (int) $user->role_id,
                422,
                'You cannot change your own Administrator role.'
            );
        }

        if (array_key_exists('password', $validated)) {
            if (!empty($validated['password'])) {
                $user->password_hash = Hash::make($validated['password']);
            }

            unset($validated['password']);
        }

        $user->fill($validated);
        $user->save();

        return response()->json([
            'message' => 'User account updated successfully.',
            'data' => $user->fresh()->load('role:role_id,role_name')
                ->makeHidden(['password_hash']),
        ]);
    }
}
