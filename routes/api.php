<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use App\Http\Controllers\AttendanceController;

Route::get('/ping', function () {
    return response()->json(['status' => 'ok', 'time' => now()->toDateTimeString()]);
});

Route::get('/very-public-test', function() {
    return response()->json(['status' => 'success', 'message' => 'If you see this, public routes are working!']);
});

Route::get('/test-setup', function() {
    return response()->json(['status' => 'success', 'message' => 'Setup route is reachable without auth']);
});

Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});

Route::get('/check-connection', function () {
    try {
        DB::connection()->getPdo();
        $connectionName = DB::connection()->getDatabaseName();
        $driver = DB::connection()->getDriverName();
        
        return response()->json([
            'status' => 'success',
            'message' => 'Backend and Database are connected!',
            'details' => [
                'database' => $connectionName,
                'driver' => $driver,
                'time' => now()->toDateTimeString()
            ]
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'status' => 'error',
            'message' => 'Database connection failed: ' . $e->getMessage(),
            'config' => [
                'driver' => config('database.default'),
                'host' => config('database.connections.' . config('database.default') . '.host'),
                'database' => config('database.connections.' . config('database.default') . '.database'),
            ]
        ], 500);
    }
});

Route::get('/test-db', function () {
    try {
        $driver = DB::connection()->getDriverName();
        $database = DB::connection()->getDatabaseName();
        
        if ($driver === 'sqlite') {
            $dbPath = config('database.connections.sqlite.database');
            $tables = DB::select('SELECT name FROM sqlite_master WHERE type="table"');
        } else {
            $dbPath = 'N/A (Using ' . $driver . ')';
            $tables = DB::select('SHOW TABLES');
        }

        return response()->json([
            'status' => 'success',
            'driver' => $driver,
            'database' => $database,
            'db_path' => $dbPath,
            'tables' => $tables
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'status' => 'error',
            'message' => $e->getMessage()
        ], 500);
    }
});

Route::get('/setup-db', function () {
    try {
        // Ensure database file exists
        $dbPath = database_path('database.sqlite');
        if (!file_exists($dbPath)) {
            touch($dbPath);
            chmod($dbPath, 0666);
        }

        // Ensure storage directories exist
        $dirs = [
            storage_path('logs'),
            storage_path('framework/sessions'),
            storage_path('framework/views'),
            storage_path('framework/cache'),
        ];
        foreach ($dirs as $dir) {
            if (!file_exists($dir)) {
                mkdir($dir, 0777, true);
            }
        }

        Artisan::call('migrate:fresh', ['--force' => true]);
        $migrationOutput = Artisan::output();
        
        // Create default admin
        \App\Models\Officer::create([
            'name' => 'Admin User',
            'biometric_id' => '1000',
            'pin' => Hash::make('1234'),
            'role' => 'SA', // Super Admin
            'post' => 'Administrator',
            'department' => 'Administration'
        ]);

        return response()->json([
            'status' => 'success', 
            'message' => 'Database initialized and admin created.',
            'migration_output' => $migrationOutput
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'status' => 'error', 
            'message' => $e->getMessage(),
            'trace' => $e->getTraceAsString()
        ]);
    }
});

Route::post('/login', [\App\Http\Controllers\AuthController::class, 'login']);

// Public Dashboard Data (Publicly accessible)
Route::get('/public-dashboard/data', [\App\Http\Controllers\DashboardController::class, 'getPublicData']);

Route::get('/debug-headers', function (Request $request) {
    $dbStatus = 'Unknown';
    $tables = [];
    try {
        DB::connection()->getPdo();
        $dbStatus = 'Connected';
        $tables = collect(DB::select('SHOW TABLES'))->map(function($table) {
            return array_values((array)$table)[0];
        })->toArray();
        
        $tokenTableExists = in_array('personal_access_tokens', $tables);
        $tokenCount = $tokenTableExists ? DB::table('personal_access_tokens')->count() : 0;
        $latestToken = $tokenTableExists ? DB::table('personal_access_tokens')->latest()->first() : null;
    } catch (\Exception $e) {
        $dbStatus = 'Error: ' . $e->getMessage();
        $tokenTableExists = false;
        $tokenCount = 0;
        $latestToken = null;
    }

    return response()->json([
        'db_status' => $dbStatus,
        'token_count' => $tokenCount,
        'latest_token_info' => $latestToken ? [
            'type' => $latestToken->tokenable_type,
            'id' => $latestToken->tokenable_id,
            'name' => $latestToken->name,
            'created_at' => $latestToken->created_at
        ] : null,
        'all_headers' => $request->headers->all(),
        'auth_header' => $request->header('Authorization'),
        'x_auth_header' => $request->header('X-Authorization'),
        'bearer_token' => $request->bearerToken(),
        'user_authenticated' => auth()->check(),
        'guard' => config('auth.defaults.guard'),
    ]);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', function (Request $request) {
        return response()->json(['status' => 'success', 'data' => $request->user()]);
    });

    // Attendance & Biometrics
    Route::get('/attendance', [AttendanceController::class, 'index']);
    Route::get('/division-attendance', [AttendanceController::class, 'divisionAttendance']);
    Route::get('/attendance/registry', [AttendanceController::class, 'registry']);
    Route::get('/attendance/monthly-registry', [AttendanceController::class, 'monthlyRegistry']);
    Route::get('/attendance/leaderboard', [AttendanceController::class, 'leaderboard']);
    Route::post('/attendance/check-in', [AttendanceController::class, 'checkIn']);
    Route::post('/attendance/check-out', [AttendanceController::class, 'checkOut']);
    Route::post('/attendance/import', [AttendanceController::class, 'importLogs']);
    
    // Core Biometric Management Routes
    Route::delete('/biometrics/logs/{id}', [AttendanceController::class, 'destroyLog']);
    Route::get('/staff/{officer}/biometric-history', [AttendanceController::class, 'officerHistory']);
    Route::post('/staff/{officer}/map-biometric', [\App\Http\Controllers\StaffController::class, 'mapBiometric']);

    // Office Layout & Department Mapping
    Route::get('/layout/mapping', [\App\Http\Controllers\DepartmentLayoutController::class, 'index']);
    Route::post('/layout/mapping', [\App\Http\Controllers\DepartmentLayoutController::class, 'update']);

    // Unavailability
    Route::get('/presence/unavailability', [\App\Http\Controllers\UnavailabilityController::class, 'index']);
    Route::post('/presence/unavailability', [\App\Http\Controllers\UnavailabilityController::class, 'store']);
    Route::delete('/presence/unavailability/{id}', [\App\Http\Controllers\UnavailabilityController::class, 'destroy']);
    Route::get('/presence/executive-status', [\App\Http\Controllers\UnavailabilityController::class, 'executiveStatus']);

    // Journal
    Route::get('/journal', [\App\Http\Controllers\JournalController::class, 'index']);
    Route::post('/journal', [\App\Http\Controllers\JournalController::class, 'store']);

    // Circles
    Route::get('/circles', [\App\Http\Controllers\CircleController::class, 'index']);
    Route::post('/circles', [\App\Http\Controllers\CircleController::class, 'store']);
    Route::get('/circles/{circle}/projects', [\App\Http\Controllers\CircleController::class, 'getProjects']);
    Route::post('/circles/{circle}/projects', [\App\Http\Controllers\CircleController::class, 'storeProject']);
    Route::get('/projects/{project}/tasks', [\App\Http\Controllers\CircleController::class, 'getTasks']);
    Route::post('/projects/{project}/tasks', [\App\Http\Controllers\CircleController::class, 'storeTask']);
    Route::post('/tasks/{task}/updates', [\App\Http\Controllers\CircleController::class, 'storeUpdate']);
    
    // Staff Management
    Route::get('/staff', [\App\Http\Controllers\StaffController::class, 'index']);
    Route::post('/staff', [\App\Http\Controllers\StaffController::class, 'store']);
    Route::put('/staff/{officer}', [\App\Http\Controllers\StaffController::class, 'update']);
    Route::delete('/staff/{officer}', [\App\Http\Controllers\StaffController::class, 'destroy']);

    // System Config
    Route::get('/config/departments', [\App\Http\Controllers\SystemConfigController::class, 'getDepartments']);
    Route::post('/config/departments', [\App\Http\Controllers\SystemConfigController::class, 'storeDepartment']);
    Route::delete('/config/departments/{id}', [\App\Http\Controllers\SystemConfigController::class, 'destroyDepartment']);
    
    Route::get('/config/designations', [\App\Http\Controllers\SystemConfigController::class, 'getDesignations']);
    Route::post('/config/designations', [\App\Http\Controllers\SystemConfigController::class, 'storeDesignation']);
    Route::delete('/config/designations/{id}', [\App\Http\Controllers\SystemConfigController::class, 'destroyDesignation']);

    // Divisional Settings
    Route::get('/settings', [\App\Http\Controllers\DivisionalSettingsController::class, 'getSettings']);
    Route::put('/settings', [\App\Http\Controllers\DivisionalSettingsController::class, 'updateSettings']);
    Route::get('/settings/holidays', [\App\Http\Controllers\DivisionalSettingsController::class, 'getHolidays']);
    Route::post('/settings/holidays', [\App\Http\Controllers\DivisionalSettingsController::class, 'storeHoliday']);
    Route::delete('/settings/holidays/{id}', [\App\Http\Controllers\DivisionalSettingsController::class, 'destroyHoliday']);

    // Security Audit
    Route::get('/audit', [\App\Http\Controllers\SecurityAuditController::class, 'index']);

    // Circulars Intelligence
    Route::get('/circulars', [\App\Http\Controllers\CircularController::class, 'index']);
    Route::post('/circulars', [\App\Http\Controllers\CircularController::class, 'store']);
    Route::delete('/circulars/{id}', [\App\Http\Controllers\CircularController::class, 'destroy']);

    // Leave Management
    Route::get('/leaves', [\App\Http\Controllers\LeaveController::class, 'index']);
    Route::post('/leaves', [\App\Http\Controllers\LeaveController::class, 'store']);
    Route::get('/admin/leaves/pending', [\App\Http\Controllers\LeaveController::class, 'pendingApprovals']);
    Route::put('/leaves/{id}/status', [\App\Http\Controllers\LeaveController::class, 'updateStatus']);

    // Resource Management
    Route::get('/resources', [\App\Http\Controllers\ResourceController::class, 'index']);
    Route::get('/resources/my-bookings', [\App\Http\Controllers\ResourceController::class, 'myBookings']);
    Route::post('/resources/bookings', [\App\Http\Controllers\ResourceController::class, 'storeBooking']);
    Route::get('/admin/resources/pending', [\App\Http\Controllers\ResourceController::class, 'pendingApprovals']);
    Route::put('/resources/bookings/{id}/status', [\App\Http\Controllers\ResourceController::class, 'updateBookingStatus']);

    // Community Feed
    Route::get('/community/posts', [\App\Http\Controllers\CommunityController::class, 'index']);
    Route::post('/community/posts', [\App\Http\Controllers\CommunityController::class, 'store']);
    Route::post('/community/posts/{id}/like', [\App\Http\Controllers\CommunityController::class, 'toggleLike']);
    Route::post('/community/posts/{id}/comments', [\App\Http\Controllers\CommunityController::class, 'storeComment']);

    // Gallery API
    Route::get('/gallery/albums', [\App\Http\Controllers\GalleryController::class, 'index']);
    Route::post('/gallery/albums', [\App\Http\Controllers\GalleryController::class, 'store']);
    Route::get('/gallery/albums/{id}', [\App\Http\Controllers\GalleryController::class, 'show']);
    Route::delete('/gallery/albums/{id}', [\App\Http\Controllers\GalleryController::class, 'destroy']);
    Route::post('/gallery/albums/{id}/photos', [\App\Http\Controllers\GalleryController::class, 'uploadPhoto']);

    // Public Dashboard Control
    Route::post('/dashboard/status', [\App\Http\Controllers\DashboardController::class, 'updateStatus']);
    
    Route::get('/dashboard/notices', [\App\Http\Controllers\DashboardController::class, 'getNotices']);
    Route::post('/dashboard/notices', [\App\Http\Controllers\DashboardController::class, 'storeNotice']);
    Route::put('/dashboard/notices/{id}', [\App\Http\Controllers\DashboardController::class, 'updateNotice']);
    Route::delete('/dashboard/notices/{id}', [\App\Http\Controllers\DashboardController::class, 'destroyNotice']);

    Route::get('/dashboard/events', [\App\Http\Controllers\DashboardController::class, 'getEvents']);
    Route::post('/dashboard/events', [\App\Http\Controllers\DashboardController::class, 'storeEvent']);
    Route::put('/dashboard/events/{id}', [\App\Http\Controllers\DashboardController::class, 'updateEvent']);
    Route::delete('/dashboard/events/{id}', [\App\Http\Controllers\DashboardController::class, 'destroyEvent']);

    Route::get('/dashboard/emergency', [\App\Http\Controllers\DashboardController::class, 'getEmergency']);
    Route::post('/dashboard/emergency', [\App\Http\Controllers\DashboardController::class, 'toggleEmergency']);

    Route::get('/dashboard/settings', [\App\Http\Controllers\DashboardController::class, 'getSettings']);
    Route::post('/dashboard/settings', [\App\Http\Controllers\DashboardController::class, 'updateSettings']);
});

Route::any('{any}', function() {
    return response()->json([
        'status' => 'error',
        'message' => 'Route not found or unauthorized',
        'path' => request()->path(),
        'headers' => request()->headers->all()
    ], 404);
})->where('any', '.*');
