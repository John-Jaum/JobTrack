<?php
use Illuminate\Support\Facades\Route; use App\Http\Controllers\Api\AuthController; use App\Http\Controllers\Api\MaintenanceRequestController; use App\Http\Controllers\Api\JobOrderController; use App\Http\Controllers\Api\MaintenanceCategoryController; use App\Http\Controllers\Api\RequestStatusController; use App\Http\Controllers\Api\NotificationController;use App\Http\Controllers\Api\LocationController;use App\Http\Controllers\Api\RoleController; use App\Http\Controllers\Api\UserController;use App\Http\Controllers\Api\MaterialController; use App\Http\Controllers\Api\DashboardController;
Route::prefix('v1')->group(function () {
 Route::post('/auth/login',[AuthController::class,'login'])->middleware('throttle:10,1');
 Route::middleware('auth:sanctum')->group(function () {
  Route::post('/auth/logout',[AuthController::class,'logout']); Route::get('/auth/me',[AuthController::class,'me']);

  Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
  Route::get('/categories',[MaintenanceCategoryController::class,'index']); Route::get('/locations', [LocationController::class, 'index']); Route::get('/statuses',[RequestStatusController::class,'index']);
  Route::get('/maintenance-requests',[MaintenanceRequestController::class,'index']); Route::post('/maintenance-requests',[MaintenanceRequestController::class,'store']); Route::get('/me/maintenance-requests',[MaintenanceRequestController::class,'myRequests']);
  Route::get('/maintenance-requests/{requestId}',[MaintenanceRequestController::class,'show']); Route::patch('/maintenance-requests/{requestId}',[MaintenanceRequestController::class,'update']); Route::delete('/maintenance-requests/{requestId}',[MaintenanceRequestController::class,'destroy']); Route::post('/maintenance-requests/{requestId}/review',[MaintenanceRequestController::class,'review']); Route::post('/maintenance-requests/{requestId}/acknowledge',[MaintenanceRequestController::class,'acknowledge']);
  Route::get('/job-orders/{jobOrderId}/assignments', [JobOrderController::class, 'assignments']);
  Route::post('/job-orders/{jobOrderId}/assignments', [JobOrderController::class, 'assignTechnician']);
  Route::post('/job-orders/{jobOrderId}/assignments/respond', [JobOrderController::class, 'respondToAssignment']);
  Route::post('/job-orders/{jobOrderId}/start', [JobOrderController::class, 'startJob']);

  Route::get('/job-orders/{jobOrderId}/work-records', [JobOrderController::class, 'workRecords']);

  Route::post('/job-orders/{jobOrderId}/work-records', [JobOrderController::class, 'storeWorkRecord']);

  Route::post('/job-orders/{jobOrderId}/complete', [JobOrderController::class, 'completeJob']);

  Route::apiResource('job-orders',JobOrderController::class)->only(['index','store','show','update']);



  Route::get('/materials', [MaterialController::class, 'index']);

  Route::get('/roles', [RoleController::class, 'index']);

  Route::apiResource('users', UserController::class)
    ->only(['index', 'store', 'show', 'update']);

  Route::get('/technicians', [UserController::class, 'technicians']);

  Route::get('/notifications', [NotificationController::class, 'index']);

  Route::post('/notifications/{notificationId}/read', [NotificationController::class, 'markRead']);

  Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);


 });
});
