<?php

namespace App\Services;

class BestFollowsApiService
{
    /** API URL */
    public string $apiUrl = 'https://bestfollows.com/api/v2';

    /** API key */
    public string $apiKey;

    public function __construct(?string $apiKey = null)
    {
        $this->apiKey = $apiKey ?? env('SMM_API_KEY', '5c5315c5a80c0758b866af2b5f6c40af');
    }

    /** Add order */
    public function order(array $data)
    {
        $post = array_merge(['key' => $this->apiKey, 'action' => 'add'], $data);
        return json_decode((string)$this->connect($post));
    }

    /** Get order status */
    public function status($orderId)
    {
        return json_decode(
            $this->connect([
                'key' => $this->apiKey,
                'action' => 'status',
                'order' => $orderId
            ])
        );
    }

    /** Get multiple orders status */
    public function multiStatus($orderIds)
    {
        return json_decode(
            $this->connect([
                'key' => $this->apiKey,
                'action' => 'status',
                'orders' => implode(",", (array)$orderIds)
            ])
        );
    }

    /** Get all available services */
    public function services()
    {
        return json_decode(
            $this->connect([
                'key' => $this->apiKey,
                'action' => 'services',
            ])
        );
    }

    /** Refill order */
    public function refill(int $orderId)
    {
        return json_decode(
            $this->connect([
                'key' => $this->apiKey,
                'action' => 'refill',
                'order' => $orderId,
            ])
        );
    }

    /** Refill multiple orders */
    public function multiRefill(array $orderIds)
    {
        return json_decode(
            $this->connect([
                'key' => $this->apiKey,
                'action' => 'refill',
                'orders' => implode(',', $orderIds),
            ]),
            true
        );
    }

    /** Get balance */
    public function balance()
    {
        return json_decode(
            $this->connect([
                'key' => $this->apiKey,
                'action' => 'balance',
            ])
        );
    }

    private function connect(array $post)
    {
        $_post = [];
        if (is_array($post)) {
            foreach ($post as $name => $value) {
                $_post[] = $name . '=' . urlencode($value);
            }
        }

        $ch = curl_init($this->apiUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_HEADER, 0);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

        if (is_array($post)) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, join('&', $_post));
        }
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/4.0 (compatible; MSIE 5.01; Windows NT 5.0)');
        $result = curl_exec($ch);
        if (curl_errno($ch) != 0 && empty($result)) {
            $result = false;
        }
        curl_close($ch);
        return $result;
    }
}
