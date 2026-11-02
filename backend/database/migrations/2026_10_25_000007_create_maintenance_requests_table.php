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
    Schema::create('maintenance_requests', function (Blueprint $table) {
        $table->id('request_id');
        $table->foreignId('requester_id')->constrained('users', 'user_id');
        $table->foreignId('location_id')->constrained('locations', 'location_id');
        $table->foreignId('category_id')->constrained('maintenance_categories', 'category_id');
        $table->foreignId('status_id')->constrained('request_statuses', 'status_id');
        $table->text('description');
        $table->enum('priority', ['Low', 'Medium', 'High', 'Urgent']);
        $table->timestamp('submitted_at')->useCurrent();
        $table->foreignId('reviewed_by')->nullable()->constrained('users', 'user_id');
        $table->timestamp('reviewed_at')->nullable();
        $table->timestamps();
    });
}
    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('maintenance_requests');
    }
};
