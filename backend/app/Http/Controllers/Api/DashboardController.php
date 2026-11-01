<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JobOrder;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function summary(Request $request)
    {
        $technicianId = $request->user()->user_id;

        // Only count job orders assigned to this technician
        // and exclude declined assignments.
        $assignedJobs = JobOrder::whereHas('assignments', function ($query) use ($technicianId) {
            $query->where('technician_id', $technicianId)
                  ->where('assignment_status', '!=', 'Declined');
        });

        // Awaiting acceptance
        $awaitingAcceptance = JobOrder::whereHas('assignments', function ($query) use ($technicianId) {
            $query->where('technician_id', $technicianId)
                  ->where('assignment_status', 'Assigned');
        })->count();

        // In-progress job orders assigned to this technician
        $inProgressJobs = JobOrder::whereHas('assignments', function ($query) use ($technicianId) {
            $query->where('technician_id', $technicianId)
                  ->where('assignment_status', '!=', 'Declined');
        })
        ->whereHas('status', function ($query) {
            $query->where('status_name', 'In Progress');
        })
        ->count();

        // Completed job orders during the current calendar month
        $completedThisMonth = JobOrder::whereHas('assignments', function ($query) use ($technicianId) {
            $query->where('technician_id', $technicianId)
                  ->where('assignment_status', '!=', 'Declined');
        })
        ->whereHas('status', function ($query) {
            $query->where('status_name', 'Completed');
        })
        ->whereBetween('closed_at', [
            now()->startOfMonth(),
            now()->endOfMonth()
        ])
        ->count();

        return response()->json([
            'data' => [
                'technician' => [
                    'assigned_jobs' => $assignedJobs->count(),
                    'awaiting_acceptance' => $awaitingAcceptance,
                    'in_progress_jobs' => $inProgressJobs,
                    'completed_this_month' => $completedThisMonth,
                ]
            ]
        ]);
    }
}