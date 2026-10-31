<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    /**
     * GET /api/v1/notifications
     * List the authenticated user's notifications.
     */
    public function index(Request $request)
    {
        $validated = $request->validate([
            'is_read' => ['sometimes', 'boolean'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $userId = $request->user()->user_id;

        $query = Notification::query()
            ->where('user_id', $userId);

        if (array_key_exists('is_read', $validated)) {
            $isRead = filter_var(
                $validated['is_read'],
                FILTER_VALIDATE_BOOLEAN
            );

            $query->where(function ($q) use ($isRead) {
                if ($isRead) {
                    $q->whereNotNull('read_at');
                } else {
                    $q->whereNull('read_at');
                }
            });
        }

        $unreadCount = Notification::where('user_id', $userId)
            ->whereNull('read_at')
            ->count();

        $perPage = $validated['per_page'] ?? 15;

        $notifications = $query
            ->orderByDesc('created_at')
            ->orderByDesc('notification_id')
            ->paginate($perPage);

        $data = $notifications->getCollection()
            ->map(fn (Notification $notification) => $this->shape($notification))
            ->values();

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $notifications->currentPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
                'last_page' => $notifications->lastPage(),
                'from' => $notifications->firstItem(),
                'to' => $notifications->lastItem(),
                'unread_count' => $unreadCount,
            ],
        ]);
    }

    /**
     * POST /api/v1/notifications/{notificationId}/read
     */
    public function markRead(Request $request, string $notificationId)
    {
        $notification = Notification::where(
            'user_id',
            $request->user()->user_id
        )->where('notification_id', $notificationId)->firstOrFail();

        if ($notification->read_at === null) {
            $notification->update(['read_at' => now()]);
            $notification->refresh();
        }

        return response()->json([
            'data' => $this->shape($notification),
        ]);
    }

    /**
     * POST /api/v1/notifications/read-all
     */
    public function markAllRead(Request $request)
    {
        Notification::where('user_id', $request->user()->user_id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->noContent();
    }

    /**
     * Map database columns to the OpenAPI v5 Notification schema.
     */
    private function shape(Notification $notification): array
    {
        $notification->loadMissing('type');

        return [
            'notification_id' => (int) $notification->notification_id,
            'type_id' => (int) $notification->notification_type_id,
            'type_label' => $notification->type?->type_name ?? '',
            'message' => $notification->message,
            'related_job_order_id' => $notification->job_order_id === null
                ? null
                : (int) $notification->job_order_id,
            'is_read' => $notification->read_at !== null,
            'created_at' => $notification->created_at?->toISOString(),
        ];
    }
}
