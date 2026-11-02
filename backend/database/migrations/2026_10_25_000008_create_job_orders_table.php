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
    Schema::create('job_orders', function (Blueprint $table) {
        $table->id('job_order_id');
        $table->foreignId('request_id')->unique()->constrained('maintenance_requests', 'request_id');
        $table->foreignId('created_by')->constrained('users', 'user_id');
        $table->foreignId('status_id')->constrained('job_order_statuses', 'status_id');
        $table->enum('priority', ['Low', 'Medium', 'High', 'Urgent']);
        $table->timestamp('approved_at')->nullable();
        $table->timestamp('closed_at')->nullable();
        $table->timestamps();
    });
}

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('job_orders');
    }
};
