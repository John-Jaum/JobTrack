<?php
namespace Database\Seeders;
use Illuminate\Database\Seeder; use Illuminate\Support\Facades\DB;
class RoleSeeder extends Seeder { public function run(): void { foreach(['Requester','Facilities Officer','Technician','Inventory Staff','Administrator'] as $name) DB::table('roles')->updateOrInsert(['role_name'=>$name],['description'=>$name.' role','updated_at'=>now(),'created_at'=>now()]); } }
