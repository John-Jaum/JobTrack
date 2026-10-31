<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Location;
use Illuminate\Http\JsonResponse;

class LocationController extends Controller
{
    public function index(): JsonResponse
    {
        $locations = Location::query()
            ->orderBy('building_name')
            ->orderBy('floor')
            ->orderBy('room_number')
            ->get([
                'location_id',
                'building_name',
                'floor',
                'room_number',
                'description',
            ]);

        return response()->json([
            'data' => $locations,
        ]);
    }
}
