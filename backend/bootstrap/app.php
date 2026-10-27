<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', api: __DIR__.'/../routes/api.php', commands: __DIR__.'/../routes/console.php', health: '/up')
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias(['role' => \App\Http\Middleware\RequireRole::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (\Throwable $e, Request $request) {
            if (!$request->is('api/*')) return null;
            $status = $e instanceof AuthenticationException ? 401 : ($e instanceof AuthorizationException ? 403 : ($e instanceof ModelNotFoundException ? 404 : ($e instanceof ValidationException ? 422 : ($e instanceof HttpExceptionInterface ? $e->getStatusCode() : 500))));
            $code = match($status) {401=>'unauthenticated',403=>'forbidden',404=>'not_found',409=>'conflict',413=>'payload_too_large',422=>'validation_failed',429=>'too_many_requests',default=>'server_error'};
            $body=['message'=>$status===500?'An unexpected server error occurred.':($e->getMessage() ?: 'The request could not be completed.'),'code'=>$code];
            if ($e instanceof ValidationException) $body['errors']=$e->errors();
            return response()->json($body,$status);
        });
    })->create();
