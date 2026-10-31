<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['category_name' => 'Electrical', 'description' => 'Electrical maintenance'],
            ['category_name' => 'Plumbing', 'description' => 'Plumbing maintenance'],
            ['category_name' => 'HVAC / Aircon', 'description' => 'Heating, ventilation, and air conditioning'],
            ['category_name' => 'Carpentry', 'description' => 'Carpentry and structural repairs'],
        ];

        foreach ($categories as $category) {
            DB::table('maintenance_categories')->updateOrInsert(
                ['category_name' => $category['category_name']],
                [
                    'description' => $category['description'],
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
        }
    }
}
