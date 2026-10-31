<?php
namespace App\Http\Middleware;
use Closure; use Illuminate\Http\Request; use Symfony\Component\HttpFoundation\Response;
class RequireRole { public function handle(Request $request, Closure $next, string ...$roles): Response { $role=$request->user()?->role?->role_name; if (!$role || !in_array($role,$roles,true)) return response()->json(['message'=>'You are not allowed to perform this action.','code'=>'forbidden'],403); return $next($request); } }
