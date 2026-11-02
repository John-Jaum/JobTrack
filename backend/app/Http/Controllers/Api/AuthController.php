<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate(['email'=>'required|email','password'=>'required|string']);
        $key = 'jobtrack-login:'.strtolower($data['email']).'|'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) { return response()->json(['message'=>'Too many login attempts.','code'=>'too_many_requests'],429,['Retry-After'=>(string)RateLimiter::availableIn($key)]); }
        $user = User::with('role')->where('email',$data['email'])->first();
        if (!$user || !Hash::check($data['password'],$user->password_hash) || !$user->is_active) { RateLimiter::hit($key,60); throw ValidationException::withMessages(['email'=>['The provided credentials are invalid or the account is inactive.']]); }
        RateLimiter::clear($key); $token=$user->createToken('jobtrack-web')->plainTextToken;
        return response()->json(['data'=>['access_token'=>$token,'token_type'=>'Bearer','user'=>$this->userPayload($user)] ]);
    }
    public function logout(Request $request) { $request->user()->currentAccessToken()?->delete(); return response()->noContent(); }
    public function me(Request $request) { return response()->json(['data'=>$this->userPayload($request->user()->load('role'))]); }
    private function userPayload(User $user): array { return ['user_id'=>$user->user_id,'full_name'=>$user->full_name,'email'=>$user->email,'phone_number'=>$user->phone_number,'is_active'=>(bool)$user->is_active,'role'=>['role_id'=>$user->role?->role_id,'role_name'=>$user->role?->role_name]]; }
}
