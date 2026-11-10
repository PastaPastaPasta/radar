#!/bin/bash
# usage: survey.sh net ip port   — one preflight + one getBestBlockHeight per node
net=$1; ip=$2; port=$3; d=survey/$net
base=https://$ip:$port/org.dash.platform.dapi.v0.Core/getBestBlockHeight
curl -s -m 12 -D $d/$ip.pre.h -o /dev/null -X OPTIONS "$base" \
  -H "Origin: https://radar.dashhq.org" -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-grpc-web,x-user-agent" \
  -w "%{http_code} conn=%{time_connect} tls=%{time_appconnect} total=%{time_total} verify=%{ssl_verify_result} err=%{errormsg}\n" > $d/$ip.pre.w 2>&1
printf '\x00\x00\x00\x00\x00' | curl -s -m 12 -D $d/$ip.post.h -o $d/$ip.post.b -X POST "$base" \
  -H "Origin: https://radar.dashhq.org" -H "Content-Type: application/grpc-web+proto" -H "X-Grpc-Web: 1" --data-binary @- \
  -w "%{http_code} conn=%{time_connect} tls=%{time_appconnect} total=%{time_total} verify=%{ssl_verify_result} err=%{errormsg}\n" > $d/$ip.post.w 2>&1
