#!/bin/bash
ip=$1; port=$2
echo | timeout 8 openssl s_client -connect $ip:$port -servername $ip 2>/dev/null | openssl x509 -noout -issuer -enddate -ext subjectAltName 2>/dev/null | tr '\n' ' ' > certs/$ip.txt
