<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\BestFollowsApiService;

class SmmController extends Controller
{
    protected BestFollowsApiService $apiService;

    public function __construct(BestFollowsApiService $apiService)
    {
        $this->apiService = $apiService;
    }

    public function getBalance()
    {
        return response()->json($this->apiService->balance());
    }

    public function getServices()
    {
        $services = $this->apiService->services();
        return response()->json($services);
    }

    public function placeOrder(Request $request)
    {
        $data = $request->only(['service', 'link', 'quantity', 'comments', 'username', 'min', 'max', 'posts', 'delay', 'expiry', 'runs', 'interval']);
        $result = $this->apiService->order($data);
        return response()->json($result);
    }

    public function getStatus(Request $request)
    {
        $orderId = $request->input('order_id');
        $orderIds = $request->input('order_ids');

        if ($orderIds && is_array($orderIds)) {
            return response()->json($this->apiService->multiStatus($orderIds));
        }

        return response()->json($this->apiService->status($orderId));
    }

    public function requestRefill(Request $request)
    {
        $orderId = $request->input('order_id');
        return response()->json($this->apiService->refill((int)$orderId));
    }
}
