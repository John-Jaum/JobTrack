<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('notification_types')->updateOrInsert(
            ['type_name' => 'Requester Acknowledgement'],
            [
                'created_at' => now(),
                'updated_at' => now()
            ]
        );
    }

    public function down(): void
    {
        DB::table('notification_types')
            ->where('type_name', 'Requester Acknowledgement')
            ->delete();
    }
};