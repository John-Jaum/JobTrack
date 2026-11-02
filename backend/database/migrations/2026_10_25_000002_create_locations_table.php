<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
{
    Schema::create('locations', function (Blueprint $table) {
        $table->id('location_id'); // <-- DAPAT 'location_id' ITO AT HINDI DEFAULT NA id()
        $table->string('building_name', 100);
        $table->string('floor', 20);
        $table->string('room_number', 20);
        $table->string('description', 255)->nullable();
        $table->timestamps();
    });
}

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('locations');
    }
};
