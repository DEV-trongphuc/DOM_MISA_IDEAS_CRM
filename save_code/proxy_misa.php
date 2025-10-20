<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);
ob_start("ob_gzhandler"); // gzip

define('API_URL', 'https://amisapp.misa.vn/crm/g1/api/business/Lead/Grid');
define('SUMMARY_URL', 'https://amisapp.misa.vn/crm/g1/api/business/Lead/summary');
define('COMPANY_CODE', 'otrwbw1q');
define('TENANT_ID', '56bc9412-2d44-4646-adb2-c0287c09a447');

$input = json_decode(file_get_contents('php://input'), true);
$from_date = $_GET['from_date'] ?? $input['from'] ?? date('Y-m-d', strtotime('-7 days'));
$to_date   = $_GET['to_date'] ?? $input['to'] ?? date('Y-m-d');
$access_token = $_GET['token'] ?? $input['token'] ?? '';
if (!$access_token) { echo json_encode(["error"=>"No access token"]); exit; }

$tz = new DateTimeZone('Asia/Ho_Chi_Minh');
$from_dt = new DateTime($from_date.' 00:00:00',$tz);
$to_dt   = new DateTime($to_date.' 00:00:00',$tz);
$from = $from_dt->format('Y-m-d\TH:i:sP');
$to   = $to_dt->format('Y-m-d\TH:i:sP');

// =========================
// Cache 5 phút
// =========================
$cache_file = sys_get_temp_dir()."/misa_cache_".md5("$from_date|$to_date").".json";
if(file_exists($cache_file) && time()-filemtime($cache_file)<300){
    echo file_get_contents($cache_file);
    exit;
}

// =========================
// Build body cho page
// =========================
function build_body($page,$from,$to){
    return [
        "Columns"=>"SUQsQ3JlYXRlZERhdGUsVGFnSUQsVGFnSURUZXh0LExlYWROYW1lLE1vYmlsZSxFbWFpbCxEZXNjcmlwdGlvbixMZWFkU291cmNlSUQsTGVhZFNvdXJjZUlEVGV4dCxPd25lcklELE93bmVySURUZXh0LEZvcm1MYXlvdXRJRCxGb3JtTGF5b3V0SURUZXh0LElzQ29udmVydGVkLEF2YXRhcixDb21wYW55TmFtZSxPZmZpY2VUZWwsT3RoZXJNb2JpbGU=",
        "CustomColumns"=>"Q3VzdG9tRmllbGQxNixDdXN0b21GaWVsZDE2VGV4dCxDdXN0b21GaWVsZDE3LEN1c3RvbUZpZWxkMTdUZXh0LEN1c3RvbUZpZWxkMTMsQ3VzdG9tRmllbGQxM1RleHQsQ3VzdG9tRmllbGQxNCxDdXN0b21GaWVsZDE0VGV4dCxDdXN0b21GaWVsZDE1LEN1c3RvbUZpZWxkMTVUZXh0",
        "Sorts"=>[["SortBy"=>"CreatedDate","Type"=>0,"SortDirection"=>1]],
        "Start"=>($page-1)*100,
        "Page"=>$page,
        "PageSize"=>100,
        "Filters"=>[
            ["Operator"=>"11","Value"=>"0","Property"=>"IsConverted","InputType"=>17,"Addition"=>1,"IsFromFormula"=>true],
            ["Value"=>json_encode(["FirstVal"=>$from,"SecondVal"=>$to]),"Value1"=>$from,"Value2"=>$to,"Addition"=>1,"Operator"=>29,"Property"=>"CreatedDate","FieldName"=>"CreatedDate","FieldType"=>0,"InputType"=>8,"IsCustomField"=>false]
        ],
        "LayoutCode"=>"Lead","DefaultTotal"=>true
    ];
}

// =========================
// Lấy total từ summary
// =========================
function fetch_total($token,$from,$to){
    $ch = curl_init(SUMMARY_URL);
    curl_setopt_array($ch,[
        CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_POST=>true,
        CURLOPT_HTTPHEADER=>[
            "Content-Type: application/json",
            "Authorization: Bearer $token",
            "companycode: ".COMPANY_CODE,
            "x-tenantid: ".TENANT_ID
        ],
        CURLOPT_POSTFIELDS=>json_encode([
            "Columns"=>"","CustomColumns"=>"Q3VzdG9tRmllbGQxNixDdXN0b21GaWVsZDE2VGV4dCxDdXN0b21GaWVsZDE3LEN1c3RvbUZpZWxkMTdUZXh0LEN1c3RvbUZpZWxkMTMsQ3VzdG9tRmllbGQxM1RleHQsQ3VzdG9tRmllbGQxNCxDdXN0b21GaWVsZDE0VGV4dCxDdXN0b21GaWVsZDE1LEN1c3RvbUZpZWxkMTVUZXh0",
            "Sorts"=>[["SortBy"=>"LastInteractionDate","Type"=>0,"SortDirection"=>1]],
            "Start"=>0,"Page"=>1,"PageSize"=>100,
            "Filters"=>[
                ["Operator"=>"11","Value"=>"0","Property"=>"IsConverted","InputType"=>17,"Addition"=>1,"IsFromFormula"=>true],
                ["Value"=>json_encode(["FirstVal"=>$from,"SecondVal"=>$to]),"Value1"=>$from,"Value2"=>$to,"Addition"=>1,"Operator"=>29,"Property"=>"CreatedDate","FieldName"=>"CreatedDate","FieldType"=>0,"InputType"=>8,"IsCustomField"=>false]
            ],
            "LayoutCode"=>"Lead","DefaultTotal"=>true
        ],JSON_UNESCAPED_UNICODE)
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    $data = json_decode($res,true);
    return $data['Data']['_Total'] ?? 0;
}

$total = fetch_total($access_token,$from,$to);
$total_pages = ceil($total/100);
$all_data = [];

// =========================
// Multi-curl chia batch 50 page/lần
// =========================
$batch_size = 50;
for($start=1;$start<=$total_pages;$start+=$batch_size){
    $mh = curl_multi_init();
    $chs = [];
    $end = min($start+$batch_size-1,$total_pages);
    for($i=$start;$i<=$end;$i++){
        $ch = curl_init(API_URL);
        curl_setopt_array($ch,[
            CURLOPT_RETURNTRANSFER=>true,
            CURLOPT_POST=>true,
            CURLOPT_HTTPHEADER=>[
                "Content-Type: application/json",
                "Authorization: Bearer $access_token",
                "companycode: ".COMPANY_CODE,
                "x-tenantid: ".TENANT_ID
            ],
            CURLOPT_POSTFIELDS=>json_encode(build_body($i,$from,$to),JSON_UNESCAPED_UNICODE)
        ]);
        curl_multi_add_handle($mh,$ch);
        $chs[$i]=$ch;
    }

    $running=null;
    do { curl_multi_exec($mh,$running); curl_multi_select($mh); } while($running>0);

    foreach($chs as $ch){
        $res = curl_multi_getcontent($ch);
        $batch = json_decode($res,true)['Data'] ?? [];
        $all_data = array_merge($all_data,$batch);
        curl_multi_remove_handle($mh,$ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
}

// =========================
// Output + cache
// =========================
$out = json_encode([
    "total"=>count($all_data),
    "range_used"=>["from_date"=>$from_date,"to_date"=>$to_date],
    "time_sent"=>["from"=>$from,"to"=>$to],
    "data"=>$all_data
],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE);

file_put_contents($cache_file,$out);
echo $out;