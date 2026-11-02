<?php
namespace Database\Seeders;
use Illuminate\Database\Seeder; use Illuminate\Support\Facades\DB; use Illuminate\Support\Facades\Hash;
class UserSeeder extends Seeder { public function run(): void { $roleId=DB::table('roles')->where('role_name','Administrator')->value('role_id'); if(!$roleId) return; DB::table('users')->updateOrInsert(['email'=>'admin@test.com'],['role_id'=>$roleId,'full_name'=>'JobTrack Administrator','password_hash'=>Hash::make(env('JOBTRACK_DEMO_PASSWORD','ChangeThisPassword123!')),'phone_number'=>null,'is_active'=>true,'updated_at'=>now(),'created_at'=>now()]); } }
