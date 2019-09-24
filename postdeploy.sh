#!/bin/sh

./bin/atomicagent-migrate && ./bin/atomicagent-worker &
./bin/atomicagent-api
